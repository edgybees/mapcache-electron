import Source from '../Source'
import path from 'path'
import VectorLayer from '../../layer/vector/VectorLayer'
import { streamingGeoPackageBuild } from '../../geopackage/GeoPackageFeatureTableUtilities'
import { VECTOR } from '../../layer/LayerTypes'
import { rmFile } from '../../util/file/FileUtilities'
import { existsSync } from 'fs'
import { streamOverpassJsonFile } from '../../util/overpass/OverpassStreamParser'
import cloneDeep from 'lodash/cloneDeep'

export default class OverpassSource extends Source {
  constructor (id, directory, filePath, sourceName, fileData) {
    super(id, directory, filePath)
    this.sourceName = sourceName
    this.fileData = fileData
  }

  async retrieveLayers (statusCallback) {
    const { layerId, layerDirectory } = this.createLayerDirectory()
    let fileName = this.sourceName + '.gpkg'
    let filePath = path.join(layerDirectory, fileName)
    try {
      const {addFeature, adjustBatchSize, done} = await streamingGeoPackageBuild(filePath, this.sourceName)
      await streamOverpassJsonFile(this.fileData.filePath, feature => {
        addFeature(cloneDeep(feature))
      }, this.fileData.elementsInFile, percentageComplete => {
        statusCallback('Parsing and storing features', 25 + Math.floor(75 * percentageComplete))
      }, adjustBatchSize)
      // rmFile(this.fileData.filePath)
      const { extent, count } = await done()
      statusCallback('Cleaning up', 100)
      await this.sleep(250)

      return [
        new VectorLayer({
          id: layerId,
          layerType: VECTOR,
          directory: layerDirectory,
          sourceDirectory: this.directory,
          name: this.sourceName,
          geopackageFilePath: filePath,
          sourceFilePath: this.fileData.filePath,
          sourceLayerName: this.sourceName,
          sourceType: 'Overpass',
          count: count,
          extent: extent
        })
      ]
    } catch (e) {
      throw new Error('Failed to parse OSM data.')
    } finally {
      // perform cleanup in case they weren't deleted
      const filePath = this.fileData.filePath
      if (existsSync(filePath)) {
        rmFile(filePath)
      }
    }
  }
}
