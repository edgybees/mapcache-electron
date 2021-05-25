import { ipcRenderer } from 'electron'
import UniqueIDUtilities from '../../../util/UniqueIDUtilities'
import LayerTypes from '../LayerTypes'
import GeoPackageTileRenderer from './GeoPackageTileRenderer'

/**
 * GeoTIFF Renderer
 */
export default class ElectronGeoPackageTileRenderer extends GeoPackageTileRenderer {
  tileRequests = {}

  /**
   * Cancels a geotiff tile request
   * @param coords
   */
  cancel (coords) {
    const coordsString = coords.x + '_' + coords.y + '_' + coords.z
    if (this.tileRequests[coordsString]) {
      const requestId = this.tileRequests[coordsString].id
      ipcRenderer.send('cancel_tile_request', {id: requestId})
      ipcRenderer.removeAllListeners('request_tile_' + requestId)
      delete this.tileRequests[coordsString]
    }
  }

  /**
   * Will make a request to a worker thread that will generate the tile data to keep the UI thread running smoooth.
   * @param coords
   * @param callback
   * @returns {Promise<void>}
   * @override
   */
  async renderTile (coords, callback) {
    const coordsString = coords.x + '_' + coords.y + '_' + coords.z
    const tileRequest = {
      id: UniqueIDUtilities.createUniqueID(),
      coords,
      tableName: this.layer.sourceLayerName,
      dbFile: this.layer.filePath,
      layerType: LayerTypes.GEOPACKAGE
    }

    this.tileRequests[coordsString] = tileRequest
    ipcRenderer.once('request_tile_' + tileRequest.id, (event, result) => {
      delete this.tileRequests[coordsString]
      try {
        if (result.error) {
          callback(result.error, null)
        } else {
          callback(null, result.base64Image)
        }
      } catch (e) {
        callback(e, null)
      }
    })
    ipcRenderer.send('request_tile', tileRequest)
  }
}
