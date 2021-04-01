import path from 'path'
import jetpack from 'fs-jetpack'
import isNil from 'lodash/isNil'
import Source from './Source'
import VectorLayer from './layer/vector/VectorLayer'
import GeoPackageCommon from '../geopackage/GeoPackageCommon'
import GeoPackageFeatureTableUtilities from '../geopackage/GeoPackageFeatureTableUtilities'

export default class GeoJSONSource extends Source {
  async retrieveLayers () {
    let featureCollection = {
      type: 'FeatureCollection',
      features: []
    }

    const data = jetpack.read(this.filePath, 'json')
    if (!isNil(data) && data.type === 'FeatureCollection') {
      featureCollection = data
    } else if (!isNil(data) && data.type === 'Feature') {
      featureCollection.features.push(data)
    }

    const { layerId, layerDirectory } = this.createLayerDirectory()
    const name = path.basename(this.filePath, path.extname(this.filePath))
    let fileName = name + '.gpkg'
    let filePath = path.join(layerDirectory, fileName)
    await GeoPackageFeatureTableUtilities.buildGeoPackage(filePath, name, featureCollection)
    const extent = await GeoPackageCommon.getGeoPackageExtent(filePath, name)
    return [
      new VectorLayer({
        id: layerId,
        name: name,
        geopackageFilePath: filePath,
        sourceFilePath: this.filePath,
        sourceDirectory: layerDirectory,
        sourceLayerName: name,
        sourceType: 'GeoJSON',
        count: featureCollection.features.length,
        extent: extent
      })
    ]
  }
}
