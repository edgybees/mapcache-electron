import * as vendor from '../../../lib/vendor'

export default class LeafletActiveLayersTools extends vendor.L.Control {
  zoomToActiveLayers
  clearActiveLayers
  constructor (options, zoomToActiveLayers, clearActiveLayers) {
    let mergedOptions = {
      ...{
        position: 'topright',
        enabled: true
      },
      ...options
    }
    super(mergedOptions)
    this.zoomToActiveLayers = zoomToActiveLayers
    this.clearActiveLayers = clearActiveLayers
  }

  onAdd (map) {
    let container = vendor.L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    this._zoomLink = vendor.L.DomUtil.create('a', 'leaflet-control-zoom-to-active', container)
    this._zoomLink.title = 'Zoom to Active'
    this._zoomLink.onclick = this.zoomToActiveLayers
    this._clearLink = vendor.L.DomUtil.create('a', 'leaflet-control-clear-active', container)
    this._clearLink.title = 'Clear Active'
    this._clearLink.onclick = this.clearActiveLayers
    return container
  }
}
