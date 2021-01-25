import Source from './Source'
import MBTilesLayer from './layer/tile/MBTilesLayer'
import UniqueIDUtilities from '../UniqueIDUtilities'
import path from 'path'
import FileUtilities from '../FileUtilities'
import jetpack from 'fs-jetpack'
import VectorStyleUtilities from '../VectorStyleUtilities'
import MBTilesUtilities from '../MBTilesUtilities'

export default class MBTilesSource extends Source {
  async retrieveLayers () {
    let name = path.basename(this.filePath, path.extname(this.filePath))
    const { sourceId, sourceDirectory } = FileUtilities.createSourceDirectory()
    let filePath = path.join(sourceDirectory, path.basename(this.filePath))
    await jetpack.copyAsync(this.filePath, filePath)
    this.db = MBTilesUtilities.getDb(this.filePath)
    let info = MBTilesUtilities.getInfo(this.db)
    if (info.name) {
      name = info.name
    }
    if (info.format === null || info.format === undefined) {
      throw new Error('Unable to determine data format.')
    }

    return [new MBTilesLayer({id: UniqueIDUtilities.createUniqueID(), filePath: filePath, name: name, sourceLayerName: name, sourceDirectory, sourceId, style: {1: VectorStyleUtilities.leafletStyle(), 2: VectorStyleUtilities.leafletStyle(), 3: VectorStyleUtilities.leafletStyle()}})]
  }
}
