import TileLayer from './TileLayer'
import { GeoPackageAPI, BoundingBox } from '@ngageoint/geopackage'
import LayerTypes from '../LayerTypes'

export default class GeoPackageLayer extends TileLayer {
  geopackage
  dao

  async initialize () {
    this.geopackage = await GeoPackageAPI.open(this.filePath)
    this.dao = this.geopackage.getTileDao(this.sourceLayerName)
    this.minZoom = this.dao.minZoom
    this.maxZoom = this.dao.maxZoom
    await super.initialize()
    return this
  }

  update (configuration) {
    super.update(configuration)
  }

  get configuration () {
    return {
      ...super.configuration,
      ...{
        extent: this.extent,
        layerType: LayerTypes.GEOPACKAGE,
        minZoom: this.minZoom,
        maxZoom: this.maxZoom
      }
    }
  }

  get extent () {
    let contentsDao = this.geopackage.contentsDao
    let contents = contentsDao.queryForId(this.sourceLayerName)
    let proj = contentsDao.getProjection(contents)
    let boundingBox = new BoundingBox(contents.min_x, contents.max_x, contents.min_y, contents.max_y).projectBoundingBox(proj, 'EPSG:4326')
    return [boundingBox.minLongitude, boundingBox.minLatitude, boundingBox.maxLongitude, boundingBox.maxLatitude]
  }

  async renderTile (coords, tileCanvas, done) {
    let {x, y, z} = coords
    if (tileCanvas) {
      await this.geopackage.xyzTile(this.sourceLayerName, x, y, z, tileCanvas.width, tileCanvas.height, tileCanvas)
      if (done) {
        done(null, tileCanvas)
      }
      return tileCanvas
    } else {
      let image = await this.geopackage.xyzTile(this.sourceLayerName, x, y, z, 256, 256)
      if (done) {
        done(null, image)
      }
      return image
    }
  }

  close () {
    if (this.geopackage) {
      try {
        this.geopackage.close()
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error)
      }
      this.geopackage = undefined
      this.dao = undefined
    }
  }
}
