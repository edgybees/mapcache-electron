import Source from './Source'
import axios from 'axios'
import path from 'path'
import GeoPackageUtilities from '../GeoPackageUtilities'
import VectorLayer from './layer/vector/VectorLayer'
import _ from 'lodash'
import GeoServiceUtilities from '../GeoServiceUtilities'
import FileUtilities from '../FileUtilities'

export default class WFSSource extends Source {
  async retrieveLayers () {
    const geopackageLayers = []
    let featureCollection = {
      type: 'FeatureCollection',
      features: []
    }
    for (const layer of this.layers) {
      let features = await this.getFeaturesInLayer(layer.name)
      featureCollection.features = featureCollection.features.concat(features)
    }
    const { sourceId, sourceDirectory } = FileUtilities.createSourceDirectory()
    let fileName = this.sourceName + '.gpkg'
    let filePath = path.join(sourceDirectory, fileName)
    await GeoPackageUtilities.buildGeoPackage(filePath, this.sourceName, featureCollection)
    const extent = GeoPackageUtilities.getGeoPackageExtent(filePath, this.sourceName)
    geopackageLayers.push(new VectorLayer({
      id: sourceId,
      name: this.sourceName,
      geopackageFilePath: filePath,
      sourceFilePath: this.filePath,
      sourceDirectory: sourceDirectory,
      sourceId: sourceId,
      sourceLayerName: this.sourceName,
      sourceType: 'WFS',
      extent: extent
    }))
    return geopackageLayers
  }

  getFeaturesInLayer (layer) {
    return new Promise( (resolve) => {
      let headers = {}
      let credentials = this.credentials
      if (credentials && (credentials.type === 'basic' || credentials.type === 'bearer')) {
        headers['authorization'] = credentials.authorization
      }
      axios({
        method: 'get',
        url: GeoServiceUtilities.getFeatureRequestURL(this.filePath, layer, 'application/json', 'crs:84', layer.version),
        headers: headers
      }).then(response => {
        let featureCollection = response.data
        if (_.isNil(featureCollection)) {
          featureCollection = {
            type: 'FeatureCollection',
            features: []
          }
        }
        resolve(featureCollection.features.filter(f => f !== undefined))
      }).catch(err => {
        // eslint-disable-next-line no-console
        console.error(err)
      })
    })
  }
}
