import GeoPackage from '@ngageoint/geopackage'
import FeatureTableStyles from '@ngageoint/geopackage/lib/extension/style/featureTableStyles'
import LayerFactory from './layer/LayerFactory'
import XYZTileUtilities from '../XYZTileUtilities'
import store from '../../store'
import imagemin from 'imagemin'
import imageminPngquant from 'imagemin-pngquant'
import CanvasUtilities from '../CanvasUtilities'
import fs from 'fs'
import _ from 'lodash'

export default class GeoPackageBuilder {
  config
  project
  cancelled
  static BUILD_MODES = {
    STARTED: 0,
    PENDING_CANCEL: 1,
    CANCELLED: 2,
    COMPLETED: 3
  }

  constructor (config, project) {
    this.config = config
    this.project = project
    this.cancelled = false
  }

  setCancelled = () => {
    this.cancelled = true
  }

  dispatchStatusUpdate (status) {
    store.dispatch('Projects/setGeoPackageStatus', {
      projectId: this.project.id,
      geopackageId: this.config.id,
      status
    })
  }
  dispatchBuildMode (buildMode) {
    store.dispatch('Projects/setGeoPackageBuildMode', {
      projectId: this.project.id,
      geopackageId: this.config.id,
      buildMode: buildMode
    })
  }

  async go () {
    let status = {
      creation: 'Building...',
      layerStatus: {}
    }
    this.dispatchBuildMode(GeoPackageBuilder.BUILD_MODES.STARTED)
    this.dispatchStatusUpdate(status)
    let gp = await GeoPackage.create(this.config.fileName)
    // execute feature configurations
    for (const layerId in this.config.featureLayers) {
      if (this.cancelled) {
        break
      }
      let geopackageLayerConfig = this.config.featureLayers[layerId]
      if (!geopackageLayerConfig.included) {
        continue
      }
      let layerStatus = {
        layerId,
        creation: 'Started',
        featuresAdded: 0,
        remainingTime: 0,
        startTime: Date.now()
      }
      status.layerStatus[layerId] = layerStatus
      this.dispatchStatusUpdate(status)
      try {
        let aoi = this.config.featureLayersShareBounds ? this.config.featureAoi : geopackageLayerConfig.aoi
        let layerConfig = this.project.layers[layerId]
        let layer = LayerFactory.constructLayer(layerConfig)
        await layer.initialize()
        // get the vectors in the bounds
        let layerColumns = layer.getLayerColumns()
        const FeatureColumn = GeoPackage.FeatureColumn
        let geometryColumns = new GeoPackage.GeometryColumns()
        geometryColumns.table_name = geopackageLayerConfig.layerName || geopackageLayerConfig.name
        geometryColumns.column_name = layerColumns.geom.name
        geometryColumns.geometry_type_name = 'GEOMETRYCOLLECTION'
        geometryColumns.z = 0
        geometryColumns.m = 0

        let columns = []
        columns.push(FeatureColumn.createPrimaryKeyColumnWithIndexAndName(0, layerColumns.id.name))
        columns.push(FeatureColumn.createGeometryColumn(1, layerColumns.geom.name, 'GEOMETRYCOLLECTION', false, null))
        let columnCount = 2
        for (const column of layerColumns.columns) {
          if (column.name !== layerColumns.id.name && column.name !== layerColumns.geom.name) {
            columns.push(FeatureColumn.createColumnWithIndex(columnCount++, column.name, GeoPackage.DataTypes.fromName(column.dataType), column.notNull, column.defaultValue))
          }
        }
        let bb = new GeoPackage.BoundingBox(aoi[0][1], aoi[1][1], aoi[0][0], aoi[1][0])
        await gp.createFeatureTableWithGeometryColumns(geometryColumns, bb, 4326, columns)
        let featureTableName = geopackageLayerConfig.layerName || geopackageLayerConfig.name

        var featureTableStyles = null
        if (!_.isNil(layer.style)) {
          await gp.getFeatureStyleExtension().getOrCreateExtension(featureTableName)
          await gp.getFeatureStyleExtension().getRelatedTables().getOrCreateExtension()
          await gp.getFeatureStyleExtension().getContentsId().getOrCreateExtension()
          featureTableStyles = new FeatureTableStyles(gp, featureTableName)
          await featureTableStyles.createTableStyleRelationship()
          await featureTableStyles.createTableIconRelationship()
          await featureTableStyles.createStyleRelationship()

          let polyStyle = layer.style.styleRowMap[layer.style.default.styles['Polygon']]
          let polygonStyleRow = featureTableStyles.getStyleDao().newRow()
          polygonStyleRow.setColor(polyStyle.color, polyStyle.opacity)
          polygonStyleRow.setFillColor(polyStyle.fillColor, polyStyle.fillOpacity)
          polygonStyleRow.setWidth(polyStyle.width)

          let lineStyle = layer.style.styleRowMap[layer.style.default.styles['LineString']]
          let lineStringStyleRow = featureTableStyles.getStyleDao().newRow()
          lineStringStyleRow.setColor(lineStyle.color, lineStyle.opacity)
          lineStringStyleRow.setWidth(lineStyle.width)

          let pointStyle = layer.style.styleRowMap[layer.style.default.styles['Point']]
          let pointStyleRow = featureTableStyles.getStyleDao().newRow()
          pointStyleRow.setColor(pointStyle.color, pointStyle.opacity)
          pointStyleRow.setWidth(pointStyle.width)

          if (layer.style.default.iconOrStyle['Point'] === 'icon') {
            let pointIcon = layer.style.iconRowMap[layer.style.default.icons['Point']]
            let pointIconRow = featureTableStyles.getIconDao().newRow()
            pointIconRow.setData(Buffer.from(pointIcon.url.split(',')[1], 'base64'))
            pointIconRow.setContentType('image/png')
            pointIconRow.setWidth(pointIcon.width)
            pointIconRow.setHeight(pointIcon.height)
            pointIconRow.setAnchorU(pointIcon.anchor_u)
            pointIconRow.setAnchorV(pointIcon.anchor_v)
            await featureTableStyles.setTableIcon('Point', pointIconRow)
            await featureTableStyles.setTableIcon('MultiPoint', pointIconRow)
          }

          await featureTableStyles.setTableStyle('Polygon', polygonStyleRow)
          await featureTableStyles.setTableStyle('LineString', lineStringStyleRow)
          await featureTableStyles.setTableStyle('Point', pointStyleRow)
          await featureTableStyles.setTableStyle('MultiPolygon', polygonStyleRow)
          await featureTableStyles.setTableStyle('MultiLineString', lineStringStyleRow)
          await featureTableStyles.setTableStyle('MultiPoint', pointStyleRow)
        }
        let icons = {}
        let styles = {}
        let iterator = await layer.iterateFeaturesInBounds(aoi)
        for (let feature of iterator) {
          if (this.cancelled) {
            break
          }
          if (feature.properties) {
            feature.properties.id = undefined
          }
          console.log('adding feature ' + feature.id)
          let featureRowId = GeoPackage.addGeoJSONFeatureToGeoPackage(gp, feature, featureTableName)
          if (!_.isNil(layer.style.features[feature.id])) {
            if (layer.style.features[feature.id].iconOrStyle === 'icon') {
              let featureIcon = layer.style.iconRowMap[layer.style.features[feature.id].icon]
              let featureIconRow = icons[layer.style.features[feature.id].icon]
              if (_.isNil(featureIconRow)) {
                featureIconRow = featureTableStyles.getIconDao().newRow()
                featureIconRow.setData(Buffer.from(featureIcon.url.split(',')[1], 'base64'))
                featureIconRow.setContentType('image/png')
                featureIconRow.setWidth(featureIcon.width)
                featureIconRow.setHeight(featureIcon.height)
                featureIconRow.setAnchorU(featureIcon.anchor_u)
                featureIconRow.setAnchorV(featureIcon.anchor_v)
              }
              await featureTableStyles.setIcon(featureRowId, feature.geometry.type, featureIconRow)
              icons[layer.style.features[feature.id].icon] = featureIconRow
            } else {
              let featureStyle = layer.style.styleRowMap[layer.style.features[feature.id].style]
              let featureStyleRow = styles[layer.style.features[feature.id].style]
              if (_.isNil(featureStyleRow)) {
                featureStyleRow = featureTableStyles.getStyleDao().newRow()
                featureStyleRow.setColor(featureStyle.color, featureStyle.opacity)
                featureStyleRow.setWidth(featureStyle.width)
                if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                  featureStyleRow.setFillColor(featureStyle.fillColor, featureStyle.fillOpacity)
                }
              }
              await featureTableStyles.setStyle(featureRowId, feature.geometry.type, featureStyleRow)
              styles[layer.style.features[feature.id].style] = featureStyleRow
            }
          }
          layerStatus.featuresAdded++
          if (layerStatus.featuresAdded % 10 === 0) {
            this.dispatchStatusUpdate(status)
          }
        }
        var featureDao = gp.getFeatureDao(featureTableName)
        var fti = featureDao.featureTableIndex
        if (fti) {
          fti.getTableIndex()
          await fti.index()
        } else {
          console.log('unable to index features')
        }
        if (this.cancelled) {
          break
        }
        layerStatus.creation = 'Completed'
        this.dispatchStatusUpdate(status)
      } catch (error) {
        layerStatus.creation = 'Failed'
        layerStatus.error = error.message
        console.log(error)
        this.dispatchStatusUpdate(status)
      }
    }

    // execute imagery configurations
    for (const layerId in this.config.imageryLayers) {
      if (this.cancelled) {
        break
      }
      let geopackageLayerConfig = this.config.imageryLayers[layerId]
      if (!geopackageLayerConfig.included || this.cancelled) {
        continue
      }
      let aoi = this.config.imageryLayersShareBounds ? this.config.imageryAoi : geopackageLayerConfig.aoi
      let minZoom = Number(this.config.imageryLayersShareBounds ? this.config.imageryMinZoom : geopackageLayerConfig.minZoom)
      let maxZoom = Number(this.config.imageryLayersShareBounds ? this.config.imageryMaxZoom : geopackageLayerConfig.maxZoom)
      let layerConfig = this.project.layers[layerId]
      let layerStatus = {
        layerId,
        totalTileCount: XYZTileUtilities.tileCountInExtent(aoi, minZoom, maxZoom),
        creation: 'Started',
        totalSize: 0,
        remainingTime: 0,
        startTime: Date.now()
      }
      status.layerStatus[layerId] = layerStatus
      this.dispatchStatusUpdate(status)
      try {
        let layer = LayerFactory.constructLayer(layerConfig)
        await layer.initialize()
        const contentsBounds = new GeoPackage.BoundingBox(aoi[0][1], aoi[1][1], aoi[0][0], aoi[1][0]).projectBoundingBox('EPSG:4326', 'EPSG:3857')
        const contentsSrsId = 3857
        const matrixSetBounds = new GeoPackage.BoundingBox(-20037508.342789244, 20037508.342789244, -20037508.342789244, 20037508.342789244)
        const tileMatrixSetSrsId = 3857
        await GeoPackage.createStandardWebMercatorTileTable(gp, geopackageLayerConfig.layerName || geopackageLayerConfig.name, contentsBounds, contentsSrsId, matrixSetBounds, tileMatrixSetSrsId, minZoom, maxZoom)
        let tilesComplete = 0
        let totalSize = 0
        let time = Date.now()
        let currentTile
        await XYZTileUtilities.iterateAllTilesInExtent(aoi, minZoom, maxZoom, async ({z, x, y}) => {
          if (this.cancelled) {
            return false
          }
          let result = await layer.renderTile({x, y, z})
          tilesComplete++
          currentTile = {z, x, y}
          if (Date.now() - time > 1000) {
            time = Date.now()
            layerStatus.tilesComplete = tilesComplete
            layerStatus.currentTile = currentTile
            layerStatus.totalSize = totalSize
            layerStatus.remainingTime = ((time - layerStatus.startTime) / layerStatus.tilesComplete) * (layerStatus.totalTileCount - layerStatus.tilesComplete)
            this.dispatchStatusUpdate(status)
          }
          if (!result) {
            return false
          }
          if (Buffer.isBuffer(result)) {
            gp.addTile(result, geopackageLayerConfig.layerName || geopackageLayerConfig.name, z, y, x)
            return false
          }
          if (result.blank) {
            return false
          }
          return new Promise((resolve, reject) => {
            if (!result.hasAlpha) {
              result.canvas.toBlob((blob) => {
                let reader = new FileReader()
                reader.addEventListener('loadend', function () {
                  totalSize += reader.result.byteLength
                  gp.addTile(Buffer.from(reader.result), geopackageLayerConfig.layerName || geopackageLayerConfig.name, z, y, x)
                  resolve(false)
                })
                reader.readAsArrayBuffer(blob)
              }, 'image/jpeg', 0.7)
            } else {
              result.canvas.toBlob((blob) => {
                let reader = new FileReader()
                reader.addEventListener('loadend', async function () {
                  const buffer = await imagemin.buffer(Buffer.from(reader.result), {
                    plugins: [
                      imageminPngquant({
                        speed: 8,
                        quality: [0.5, 0.8]
                      })
                    ]
                  })

                  totalSize += buffer.length
                  // console.log('totalSize', totalSize)
                  gp.addTile(buffer, geopackageLayerConfig.layerName || geopackageLayerConfig.name, z, y, x)
                  resolve(false)
                })
                reader.readAsArrayBuffer(blob)
              }, 'image/png')
            }
          })
        })
        if (this.cancelled) {
          break
        }
        layerStatus.tilesComplete = layerStatus.totalTileCount
        layerStatus.currentTile = currentTile
        layerStatus.totalSize = totalSize
        layerStatus.remainingTime = 0
        layerStatus.creation = 'Completed'
        this.dispatchStatusUpdate(status)
      } catch (error) {
        layerStatus.creation = 'Failed'
        layerStatus.error = error.message
        this.dispatchStatusUpdate(status)
      }
    }

    let includedFeatureToImageryLayers = Object.values(this.config.featureToImageryLayers).filter(l => l.included)
    // execute feature to imagery configuration
    if (includedFeatureToImageryLayers.length > 0 && !this.cancelled) {
      const layerId = this.config.featureImageryConversion.name
      let aoi = this.config.featureImageryConversion.aoi
      let minZoom = this.config.featureImageryConversion.minZoom
      let maxZoom = this.config.featureImageryConversion.maxZoom
      let layerStatus = {
        layerId,
        totalTileCount: XYZTileUtilities.tileCountInExtent(aoi, minZoom, maxZoom),
        creation: 'Started',
        totalSize: 0,
        remainingTime: 0,
        startTime: Date.now()
      }
      status.layerStatus[layerId] = layerStatus
      this.dispatchStatusUpdate(status)
      try {
        const layersToInclude = includedFeatureToImageryLayers.map(l => this.project.layers[l.id])
        const orderedLayersToInclude = []
        if (this.config.featureImageryConversion.layerOrder) {
          this.config.featureImageryConversion.layerOrder.forEach((l) => {
            const layerConfig = layersToInclude.find(layer => layer.name === l.name)
            if (layerConfig) {
              orderedLayersToInclude.push(LayerFactory.constructLayer(layerConfig))
            }
          })
        } else {
          layersToInclude.forEach((l) => {
            orderedLayersToInclude.push(LayerFactory.constructLayer(l))
          })
        }

        // Iterate over each layer and generate dem tiles! Use the style too dawg!
        const contentsBounds = new GeoPackage.BoundingBox(aoi[0][1], aoi[1][1], aoi[0][0], aoi[1][0]).projectBoundingBox('EPSG:4326', 'EPSG:3857')
        const contentsSrsId = 3857
        const matrixSetBounds = new GeoPackage.BoundingBox(-20037508.342789244, 20037508.342789244, -20037508.342789244, 20037508.342789244)
        const tileMatrixSetSrsId = 3857
        await GeoPackage.createStandardWebMercatorTileTable(gp, layerId, contentsBounds, contentsSrsId, matrixSetBounds, tileMatrixSetSrsId, minZoom, maxZoom)
        let tilesComplete = 0
        let totalSize = 0
        let time = Date.now()
        let currentTile

        for (let i = 0; i < orderedLayersToInclude.length; i++) {
          if (this.cancelled) {
            break
          }
          await orderedLayersToInclude[i].initialize()
        }
        await XYZTileUtilities.iterateAllTilesInExtent(aoi, minZoom, maxZoom, async ({z, x, y}) => {
          if (this.cancelled) {
            return false
          }
          currentTile = {z, x, y}
          let canvas = document.createElement('canvas')
          canvas.width = 256
          canvas.height = 256
          let ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          // iterate over each feature layer and render the x,y,z tile for that feature
          for (let i = 0; i < orderedLayersToInclude.length; i++) {
            await new Promise((resolve, reject) => {
              orderedLayersToInclude[i].renderTile(currentTile, null, (err, buffer) => {
                if (err) {
                  reject(err)
                } else {
                  let img = new Image()
                  img.onload = () => {
                    ctx.drawImage(img, 0, 0)
                    resolve()
                  }
                  img.src = 'data:image/png;base64,' + btoa(String.fromCharCode.apply(null, buffer))
                }
              })
            })
          }
          if (!CanvasUtilities.isBlank(canvas)) {
            await new Promise((resolve) => {
              if (CanvasUtilities.hasTransparentPixels(canvas)) {
                canvas.toBlob((blob) => {
                  let reader = new FileReader()
                  reader.addEventListener('loadend', async function () {
                    const buffer = await imagemin.buffer(Buffer.from(reader.result), {
                      plugins: [
                        imageminPngquant({
                          speed: 8,
                          quality: [0.5, 0.8]
                        })
                      ]
                    })

                    totalSize += buffer.length
                    // console.log('totalSize', totalSize)
                    gp.addTile(buffer, layerId, z, y, x)
                    resolve(false)
                  })
                  reader.readAsArrayBuffer(blob)
                }, 'image/png')
              } else {
                canvas.toBlob((blob) => {
                  const reader = new FileReader()
                  reader.addEventListener('loadend', function () {
                    totalSize += reader.result.byteLength
                    gp.addTile(Buffer.from(reader.result), layerId, z, y, x)
                    resolve(false)
                  })
                  reader.readAsArrayBuffer(blob)
                }, 'image/jpeg', 0.7)
              }
            })
          }
          tilesComplete++
          if (Date.now() - time > 1000) {
            time = Date.now()
            layerStatus.tilesComplete = tilesComplete
            layerStatus.currentTile = currentTile
            layerStatus.totalSize = totalSize
            layerStatus.remainingTime = ((time - layerStatus.startTime) / layerStatus.tilesComplete) * (layerStatus.totalTileCount - layerStatus.tilesComplete)
            this.dispatchStatusUpdate(status)
          }
        })
        if (!this.cancelled) {
          layerStatus.tilesComplete = layerStatus.totalTileCount
          layerStatus.currentTile = currentTile
          layerStatus.totalSize = totalSize
          layerStatus.remainingTime = 0
          layerStatus.creation = 'Completed'
          this.dispatchStatusUpdate(status)
        }
      } catch (error) {
        layerStatus.creation = 'Failed'
        layerStatus.error = error.message
        this.dispatchStatusUpdate(status)
      }
    }
    if (this.cancelled) {
      this.cancelled = false
      fs.unlinkSync(this.config.fileName)
      status.creation = 'Cancelled'
      Object.values(status.layerStatus).filter(s => s.creation === 'Started').forEach(s => {
        s.creation = 'Cancelled'
      })
      this.dispatchBuildMode(GeoPackageBuilder.BUILD_MODES.CANCELLED)
      this.dispatchStatusUpdate(status)
    } else {
      status.creation = 'Completed'
      this.dispatchBuildMode(GeoPackageBuilder.BUILD_MODES.COMPLETED)
      this.dispatchStatusUpdate(status)
    }
  }
}
