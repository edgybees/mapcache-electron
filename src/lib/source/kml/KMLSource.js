import fs from 'fs'
import path from 'path'
import Source from '../Source'
import VectorLayer from '../../layer/vector/VectorLayer'
import { createUniqueID } from '../../util/UniqueIDUtilities'
import { streamingGeoPackageBuild } from '../../geopackage/GeoPackageFeatureTableUtilities'
import { convertGroundOverlayToGeotiffLayer, rotateImage } from '../../util/kml/KMLUtilities'
import { getDefaultIcon } from '../../util/style/NodeStyleUtilities'
import { createDirectory, createNextAvailableLayerDirectory, rmDirAsync } from '../../util/file/FileUtilities'
import { VECTOR } from '../../layer/LayerTypes'
import { getRemoteImage } from '../../network/NetworkRequestUtils'
import { streamKml } from './KmlStream'
import { disposeImage, makeImage } from '../../util/canvas/CanvasUtilities'

export default class KMLSource extends Source {

  /**
   * Generates an icon from a kml IconStyle element
   * @param kmlIconStyle
   * @param kmlDir
   * @param tmpDir
   * @param iconFileName
   * @return {Promise<{anchorV: number, data: Buffer, anchorU: number, width: number, name: string, description: string, contentType: string, height: number}>}
   */
  async generateIconFromKmlIconStyle (kmlIconStyle, kmlDir, tmpDir, iconFileName) {
    let icon = null
    let iconName = path.basename(kmlIconStyle.href, path.extname(kmlIconStyle.href))
    let iconFile = path.join(kmlDir, kmlIconStyle.href)
    let cachedIconFile = path.join(tmpDir, kmlIconStyle.href)

    if (kmlIconStyle.href.startsWith('http')) {
      iconFile = iconFileName
      cachedIconFile = path.join(tmpDir, path.basename(kmlIconStyle.href))
      await getRemoteImage(kmlIconStyle.href, cachedIconFile)
      iconFile = cachedIconFile
    }

    if (fs.existsSync(iconFile)) {
      try {
        if (kmlIconStyle.heading != null) {
          iconFile = await rotateImage(iconFile, parseFloat(kmlIconStyle.heading))
        }
        const scale = kmlIconStyle.scale || 1.0
        const dataUrl = 'data:image/' + path.extname(iconFile).substring(1) + ';base64,' + fs.readFileSync(iconFile).toString('base64')
        const image = await makeImage(dataUrl)
        const width = scale * image.width()
        const height = scale * image.height()
        disposeImage(image)
        let anchorU = 0.5
        let anchorV = 0.5
        if (kmlIconStyle.anchor_x != null) {
          if (kmlIconStyle.anchor_x.mode === 'pixels') {
            anchorU = kmlIconStyle.anchor_x.value / width
          } else if (kmlIconStyle.anchor_x.mode === 'insetPixels') {
            anchorU = (width - kmlIconStyle.anchor_x.value) / width
          } else if (kmlIconStyle.anchor_x.mode === 'fraction') {
            anchorU = kmlIconStyle.anchor_x.value
          }
        }
        if (kmlIconStyle.anchor_y != null) {
          if (kmlIconStyle.anchor_y.mode === 'pixels') {
            anchorV = kmlIconStyle.anchor_y.value / height
          } else if (kmlIconStyle.anchor_y.mode === 'insetPixels') {
            anchorV = (height - kmlIconStyle.anchor_y.value) / height
          } else if (kmlIconStyle.anchor_y.mode === 'fraction') {
            anchorV = kmlIconStyle.anchor_y.value
          }
        }
        icon = {
          contentType: 'image/' + path.extname(iconFile).substring(1),
          data: fs.readFileSync(iconFile),
          width: width,
          height: height,
          anchorU: anchorU,
          anchorV: anchorV,
          name: iconName
        }
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to generate icon.')
      }
    }

    if (icon == null) {
      icon = getDefaultIcon('Default')
    }

    return icon
  }

  /**
   * Retrieves all of the layers belonging to this source
   * @param statusCallback
   * @returns {Promise<*[]>}
   */
  async retrieveLayers (statusCallback) {
    statusCallback('Processing KML file', 0)
    await this.sleep(250)
    let layers = []
    // setup tmp directory
    const tmpDir = path.join(this.directory, 'tmp')
    createDirectory(tmpDir)

    const kmlDirectory = path.dirname(this.filePath)
    const name = path.basename(this.filePath, path.extname(this.filePath))

    const { layerId, layerDirectory } = this.createLayerDirectory()
    let fileName = name + '.gpkg'
    let filePath = path.join(layerDirectory, fileName)
    const {addFeature, addStyle, addIcon, setFeatureStyle, setFeatureIcon, done} = await streamingGeoPackageBuild(filePath, name)

    statusCallback('Parsing and storing features', 0)

    const groundOverlays = []
    const styles = {}
    const styleMaps = {}
    let featureCount = 0

    await streamKml(this.filePath, () => {
      featureCount++
    }, groundOverlay => {
      groundOverlays.push(groundOverlay)
    }, style => {
      styles[style.id] = style
    }, styleMap => {
      styleMaps[styleMap.id] = styleMap
    })

    // iterate over styles/icons and add them to the geopackage
    const styleIdMap = {}
    const iconIdMap = {}
    const styleIds = Object.keys(styles)
    let iconFileNameCount = 1
    for (let i = 0; i < styleIds.length; i++) {
      const styleId = styleIds[i]
      const style = styles[styleId]
      if (style.href != null) {
        iconIdMap[styleId] = addIcon(await this.generateIconFromKmlIconStyle(style, kmlDirectory, tmpDir, 'icon_' + iconFileNameCount))
        iconFileNameCount++
      } else {
        style.name = style.id
        styleIdMap[styleId] = addStyle(style)
      }
    }

    const notifyStepSize = Math.ceil(featureCount / 15)

    let featuresAdded = 0
    await streamKml(this.filePath, (feature) => {
      let styleRef = feature.styleId
      delete feature.styleId
      const featureRowId = addFeature(feature)
      if (styleRef != null) {
        // if ref is for a map, select the normal style reference
        if (styleMaps[styleRef] != null) {
          styleRef = styleMaps[styleRef].normal

        }

        // check if it is a style or icon
        if (styleIdMap[styleRef] != null) {
          const styleRowId = styleIdMap[styleRef]
          setFeatureStyle(featureRowId, feature.geometry.type, styleRowId)

        } else if (iconIdMap[styleRef] != null) {
          const iconRowId = iconIdMap[styleRef]
          setFeatureIcon(featureRowId, feature.geometry.type, iconRowId)
        }
      }

      if (((featuresAdded + 1) % notifyStepSize) === 0) {
        statusCallback('Parsing and storing features', (5 * ((featuresAdded + 1) / notifyStepSize)))
      }
      featuresAdded++
    }, () => {}, () => {}, () => {})

    const { extent, count } = await done()

    statusCallback('Processing ground overlays', 75)

    for (let i = 0; i < groundOverlays.length; i++) {
      const groundOverlay = groundOverlays[i]
      if (groundOverlay.name == null) {
        groundOverlay.name = 'Ground Overlay #' + i
      }
      const geotiffLayer = await convertGroundOverlayToGeotiffLayer(groundOverlay, kmlDirectory, tmpDir, () => {
        return { layerId: createUniqueID(), layerDirectory: createNextAvailableLayerDirectory(this.directory), sourceDirectory: this.directory}
      })
      if (geotiffLayer != null) {
        layers.push(geotiffLayer)
      }
      statusCallback('Processing ground overlays', (75 + 25 *  (i + 1 / groundOverlays.length)))
    }

    statusCallback('Cleaning up', 100)
    await this.sleep(250)

    layers.push(new VectorLayer({
      id: layerId,
      layerType: VECTOR,
      directory: layerDirectory,
      sourceDirectory: this.directory,
      geopackageFilePath: filePath,
      sourceLayerName: name,
      sourceType: 'KML',
      count: count,
      extent: extent
    }))

    await rmDirAsync(tmpDir)

    return layers
  }
}
