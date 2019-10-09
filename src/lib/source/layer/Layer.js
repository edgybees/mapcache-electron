import path from 'path'
import { userDataDir } from '../../settings/Settings'

export default class Layer {
  _configuration
  id
  filePath
  credentials
  sourceLayerName
  name
  displayName
  constructor (configuration = {}) {
    this._configuration = configuration
    this.id = this._configuration.id || createId()
    this.filePath = this._configuration.filePath
    this.credentials = this._configuration.credentials
    this.sourceLayerName = this._configuration.sourceLayerName || defaultLayerName(this.filePath)
    this.name = this._configuration.name || this.sourceLayerName
    this.overviewTilePath = this.cacheFolder.dir(this.id).path('overviewTile.png')
    this.pane = configuration.pane
    this.style = this._configuration.style
    this.mbStyle = this._configuration.mbStyle
    this.shown = this._configuration.shown || true
    this.editableStyle = this._configuration.editableStyle !== undefined ? this._configuration.editableStyle : true
    this.images = this._configuration.images
    this.displayName = this._configuration.displayName || this.name
  }

  async initialize () {
    throw new Error('Abstract method to be implemented in sublcass')
  }

  get cacheFolder () {
    return userDataDir().dir(this.id)
  }

  get configuration () {
    return {
      ...this._configuration,
      ...{
        id: this.id,
        filePath: this.filePath,
        credentials: this.credentials,
        sourceLayerName: this.sourceLayerName,
        name: this.name,
        displayName: this.displayName,
        overviewTilePath: this.overviewTilePath,
        shown: this.shown || true,
        style: this.style,
        mbStyle: this.mbStyle,
        editableStyle: this.editableStyle,
        images: this.images
      }
    }
  }
}

function createId () {
  function s4 () {
    return new Date().getTime()
      .toString(16)
      .substring(1)
  }
  return s4()
}

function defaultLayerName (filePath) {
  return path.basename(filePath, path.extname(filePath))
}
