import Layer from '../Layer'

export default class TileLayer extends Layer {
  async initialize () {
    this.style = this._configuration.style || {}
  }

  get configuration () {
    return {
      ...super.configuration,
      ...{
        pane: 'tile',
        extent: this.extent
      }
    }
  }

  renderTile () {
    throw new Error('Abstract method to be implemented in subclass')
  }
}
