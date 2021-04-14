import path from 'path'
import XYZServerSource from './XYZServerSource'
import KMLSource from './KMLSource'
import KMZSource from './KMZSource'
import WMSSource from './WMSSource'
import WFSSource from './WFSSource'
import ArcGISFeatureServiceSource from './ArcGISFeatureServiceSource'
import ShapeFileSource from './ShapeFileSource'
import ZipSource from './ZipSource'
import GeoTIFFSource from './GeoTIFFSource'
import GeoJSONSource from './GeoJSONSource'
import MBTilesSource from './MBTilesSource'

/**
 * Handles generation of a source object given a source configuration. These objects will be used to retrieve data
 * source layers for use in the application
 */
export default class SourceFactory {
  static async constructSource (sourceConfiguration) {
    let source = null
    if (sourceConfiguration.serviceType !== null && sourceConfiguration.serviceType !== undefined) {
      if (sourceConfiguration.serviceType === 0) {
        source = new WMSSource(sourceConfiguration.id, sourceConfiguration.directory, sourceConfiguration.url, sourceConfiguration.layers, sourceConfiguration.name, sourceConfiguration.format)
      } else if (sourceConfiguration.serviceType === 1) {
        source = new WFSSource(sourceConfiguration.id, sourceConfiguration.directory, sourceConfiguration.url, sourceConfiguration.layers, sourceConfiguration.name)
      } else if (sourceConfiguration.serviceType === 2) {
        source = new XYZServerSource(sourceConfiguration.id, sourceConfiguration.directory, sourceConfiguration.url, sourceConfiguration.subdomains, sourceConfiguration.name)
      } else if (sourceConfiguration.serviceType === 3) {
        source = new ArcGISFeatureServiceSource(sourceConfiguration.id, sourceConfiguration.directory, sourceConfiguration.url, sourceConfiguration.layers, sourceConfiguration.name)
      }
    } else {
      const filePath = sourceConfiguration.file.path
      let type = path.extname(filePath).slice(1)
      try {
        switch (type) {
          case 'kml':
            source = new KMLSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'kmz':
            source = new KMZSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'zip':
            source = new ZipSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'shp':
            source = new ShapeFileSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'mbtiles':
            source = new MBTilesSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'json':
          case 'geojson':
            source = new GeoJSONSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          case 'geotiff':
          case 'tif':
          case 'tiff':
            source = new GeoTIFFSource(sourceConfiguration.id, sourceConfiguration.directory, filePath)
            break
          default:
            break
        }
      } catch (e) {
        throw new Error('Failed to open file ' + filePath + ' ' + e.message)
      }
    }
    return source
  }
}
