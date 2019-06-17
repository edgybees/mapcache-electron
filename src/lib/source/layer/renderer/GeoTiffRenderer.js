import TileBoundingBoxUtils from '../../../tile/tileBoundingBoxUtils'
import proj4 from 'proj4'
import gdal from 'gdal'

var defs = require('../../../projection/proj4Defs')
for (var name in defs) {
  if (defs[name]) {
    proj4.defs(name, defs[name])
  }
}

export default class GeoTiffRenderer {
  layer
  constructor (geoTiffLayer) {
    this.layer = geoTiffLayer
  }

  async renderTile (coords, tile, done) {
    let {x, y, z} = coords

    var gt = this.layer.ds.geoTransform
    if (gt[2] !== 0 || gt[4] !== 0) {
      console.log('error the geotiff is skewed, need to warp first')
      return done()
    }

    let tileBbox = TileBoundingBoxUtils.getWebMercatorBoundingBoxFromXYZ(x, y, z)
    let tileUpperRight = proj4('EPSG:3857').inverse([tileBbox.maxLon, tileBbox.maxLat])
    let tileLowerLeft = proj4('EPSG:3857').inverse([tileBbox.minLon, tileBbox.minLat])
    let tileUpperRightBuffered = proj4('EPSG:3857').inverse([tileBbox.maxLon + (tileBbox.maxLon - tileBbox.minLon), tileBbox.maxLat + (tileBbox.maxLat - tileBbox.minLat)])
    let tileLowerLeftBuffered = proj4('EPSG:3857').inverse([tileBbox.minLon - (tileBbox.maxLon - tileBbox.minLon), tileBbox.minLat - (tileBbox.maxLat - tileBbox.minLat)])
    var fullExtent = this.layer.extent
    if (!TileBoundingBoxUtils.tileIntersects(tileUpperRightBuffered, tileLowerLeftBuffered, [fullExtent[2], fullExtent[3]], [fullExtent[0], fullExtent[1]])) {
      console.log('Tile does not intersect with the buffered tile')
      if (done) {
        return done(null, tile)
      }
      return
    }
    console.log('Tile Intersects - start rendering')
    console.time('x ' + coords.x + ' y ' + coords.y + ' z ' + coords.z)

    if (!tile) {
      tile = document.createElement('canvas')
      tile.width = 256
      tile.height = 256
    }

    let ctx = tile.getContext('2d')

    let target = ctx.createImageData(tile.width, tile.height)
    let targetData = target.data

    var tileCutline = this.createCutlineInProjection({west: tileLowerLeft[0], south: tileLowerLeft[1], east: tileUpperRight[0], north: tileUpperRight[1]}, gdal.SpatialReference.fromEPSG(3857))
    var srcCutline = this.createPixelCoordinateCutline({west: fullExtent[0], south: fullExtent[1], east: fullExtent[2], north: fullExtent[3]}, this.layer.ds)

    let dstBands = [1]
    if (this.layer.dstRedBand) {
      dstBands = [this.layer.dstRedBand]
      if (this.layer.dstGreenBand) {
        dstBands.push(this.layer.dstGreenBand)
        if (this.layer.dstBlueBand) {
          dstBands.push(this.layer.dstBlueBand)
        }
      }
    }
    if (this.layer.dstAlphaBand) {
      dstBands.push(this.layer.dstAlphaBand)
    }

    let reprojectedFile = this.reproject(this.layer.ds, 3857, tileCutline, srcCutline, this.layer.srcBands, this.layer.srcAlphaBand, dstBands, this.layer.dstAlphaBand, tile.width, tile.height)

    this.populateTargetData(targetData, reprojectedFile, tile.width, tile.height)

    reprojectedFile.close()

    ctx.clearRect(0, 0, tile.width, tile.height)
    ctx.putImageData(target, 0, 0)
    setTimeout(() => {
      if (done) {
        done(null, tile)
      }
    }, 0)
    console.timeEnd('x ' + x + ' y ' + y + ' z ' + z)
    return tile.toDataURL()
  }

  createRGBArrays (width, height) {
    let ArrayType = Uint8Array
    let dt = this.layer.ds.bands.get(1).dataType
    if (dt === gdal.GDT_UInt16) {
      ArrayType = Uint16Array
    }
    let r = new ArrayType(new ArrayBuffer((this.layer.bitsPerSample[0] / 8) * width * height))
    let g = new ArrayType(new ArrayBuffer((this.layer.bitsPerSample[1] / 8) * width * height))
    let b = new ArrayType(new ArrayBuffer((this.layer.bitsPerSample[2] / 8) * width * height))
    let a = new ArrayType(new ArrayBuffer((this.layer.bitsPerSample.length === 4 ? (this.layer.bitsPerSample[3] / 8) : (this.layer.bitsPerSample[2] / 8)) * width * height))
    return {
      r, g, b, a
    }
  }

  populateTargetData (targetData, ds, width, height) {
    if (this.layer.photometricInterpretation === 2 || this.layer.srcBands.length >= 3) {
      // RGB === 2
      let readOptions = {
      }
      let { r, g, b, a } = this.createRGBArrays(width, height)

      if (this.layer.dstRedBand) {
        ds.bands.get(this.layer.dstRedBand).pixels.read(0, 0, width, height, r, readOptions)
      }
      if (this.layer.dstGreenBand) {
        ds.bands.get(this.layer.dstGreenBand).pixels.read(0, 0, width, height, g, readOptions)
      }
      if (this.layer.dstBlueBand) {
        ds.bands.get(this.layer.dstBlueBand).pixels.read(0, 0, width, height, b, readOptions)
      }
      if (this.layer.dstAlphaBand) {
        ds.bands.get(this.layer.dstAlphaBand).pixels.read(0, 0, width, height, a, readOptions)
      }

      let colorConstant = 1
      let dt = this.layer.ds.bands.get(1).dataType
      if (dt === gdal.GDT_UInt16) {
        colorConstant = 8
      }

      for (let i = 0; i < r.length; i++) {
        if (this.layer.dstRedBand) {
          targetData[i * 4] = r[i] / colorConstant
        } else {
          targetData[i * 4] = 0
        }
        if (this.layer.dstGreenBand) {
          targetData[(i * 4) + 1] = g[i] / colorConstant
        } else {
          targetData[(i * 4) + 1] = 0
        }
        if (this.layer.dstBlueBand) {
          targetData[(i * 4) + 2] = b[i] / colorConstant
        } else {
          targetData[(i * 4) + 2] = 0
        }
        if (this.layer.dstAlphaBand) {
          targetData[(i * 4) + 3] = a[i] / colorConstant
        } else {
          targetData[(i * 4) + 3] = (r[i] || (!this.layer.dstGreenBand || g[i]) || (!this.layer.dstBlueBand || b[i])) ? 255 : 0
        }
      }
    } else if (this.layer.photometricInterpretation === 3) {
      // Palette === 3
      let colorMap = new Uint16Array(this.layer.colorMap.buffer)
      let readOptions = {}
      let colorBand = ds.bands.get(1).pixels.read(0, 0, width, height, null, readOptions)
      let alphaBand = ds.bands.get(2).pixels.read(0, 0, width, height, null, readOptions)

      const greenOffset = colorMap.length / 3
      const blueOffset = colorMap.length / 3 * 2
      for (let i = 0, j = 0; i < colorBand.length; ++i, j += 3) {
        const mapIndex = colorBand[i]
        targetData[i * 4] = colorMap[mapIndex] / 65536 * 256
        targetData[(i * 4) + 1] = colorMap[mapIndex + greenOffset] / 65536 * 256
        targetData[(i * 4) + 2] = colorMap[mapIndex + blueOffset] / 65536 * 256
        targetData[(i * 4) + 3] = this.layer.dstAlphaBand ? alphaBand[i] : 255
      }
    } else if (this.layer.photometricInterpretation === 1) {
      // BlackIsZero === 1
      const noDataValue = ds.bands.get(1).noDataValue
      console.log(noDataValue)
      let greyBand = ds.bands.get(1).pixels.read(0, 0, width, height, null, {})
      let alphaBand = null
      let alphaBandExists = false
      if (ds.bands.count() === 2) {
        alphaBand = ds.bands.get(2).pixels.read(0, 0, width, height, null, {})
        alphaBandExists = true
      }
      for (let pos = 0, i = 0; pos < greyBand.length * 4; pos += 4, i++) {
        targetData[pos] = greyBand[i]
        targetData[pos + 1] = greyBand[i]
        targetData[pos + 2] = greyBand[i]
        targetData[pos + 3] = alphaBandExists ? alphaBand[i] : noDataValue && noDataValue === greyBand[i] ? 0 : 255
      }
    } else if (this.layer.photometricInterpretation === 0) {
      // WhiteIsZero === 0
      let greyBand = ds.bands.get(1).pixels.read(0, 0, width, height, null, {})
      let alphaBand = null
      let alphaBandExists = false
      if (ds.bands.count() === 2) {
        alphaBand = ds.bands.get(2).pixels.read(0, 0, width, height, null, {})
        alphaBandExists = true
      }
      for (let pos = 0, i = 0; pos < greyBand.length * 4; pos += 4, i++) {
        targetData[pos] = 255 - greyBand[i]
        targetData[pos + 1] = 255 - greyBand[i]
        targetData[pos + 2] = 255 - greyBand[i]
        targetData[pos + 3] = alphaBandExists ? alphaBand[i] : 255
      }
    }
  }

  reproject (ds, epsgCode, tileCutline, srcCutline, srcBands, srcAlphaBand, dstBands, dstAlphaBand, width, height) {
    let tileExtent = tileCutline.getEnvelope()
    let targetSrs = gdal.SpatialReference.fromEPSG(epsgCode)

    let gt = ds.geoTransform

    let tr = {
      x: Math.max(tileExtent.maxX - tileExtent.minX) / width,
      y: Math.max(tileExtent.maxY - tileExtent.minY) / height
    }

    let numBands = ds.bands.count()
    if (!dstAlphaBand) {
      // no destination alpha band is set, we will add one for unset pixels
      numBands += 1
    }

    const noDataValue = ds.bands.get(1).noDataValue

    let destination = gdal.open('memory', 'w', 'MEM', width, height, numBands, ds.bands.get(1).dataType)
    destination.srs = targetSrs
    destination.geoTransform = [
      tileExtent.minX, tr.x, gt[2],
      tileExtent.maxY, gt[4], -tr.y
    ]
    let sourceBands = srcBands
    let destinationBands = dstBands

    let options = {
      src: ds,
      dst: destination,
      s_srs: ds.srs, // jshint ignore:line
      t_srs: targetSrs, // jshint ignore:line
      cutline: srcCutline.getEnvelope().toPolygon(),
      sourceBands,
      destinationBands
    }
    if (srcAlphaBand && dstAlphaBand) {
      options.srcAlphaBand = srcAlphaBand
      options.dstAlphaBand = dstAlphaBand
    } else {
      // again no dstAlphaBand was set, so specify band added
      options.dstAlphaBand = numBands
    }

    if (noDataValue) {
      console.log('src has a nodata value of ' + noDataValue)
      options.srcNodata = noDataValue
      options.dstNodata = noDataValue
    }

    gdal.reprojectImage(options)

    return destination
  }

  createPixelCoordinateCutline (envelope, ds) {
    var sourcePixels = new gdal.CoordinateTransformation(ds.srs, ds)
    var sourceCoords = new gdal.CoordinateTransformation(gdal.SpatialReference.fromEPSG(4326), ds.srs)

    var ul = sourceCoords.transformPoint(envelope.west, envelope.north)
    var ur = sourceCoords.transformPoint(envelope.east, envelope.north)
    var lr = sourceCoords.transformPoint(envelope.east, envelope.south)
    var ll = sourceCoords.transformPoint(envelope.west, envelope.south)

    ul = sourcePixels.transformPoint(ul.x, ul.y)
    ur = sourcePixels.transformPoint(ur.x, ur.y)
    lr = sourcePixels.transformPoint(lr.x, lr.y)
    ll = sourcePixels.transformPoint(ll.x, ll.y)

    var cutline = new gdal.Polygon()
    var ring = new gdal.LinearRing()
    ring.points.add([ul, ur, lr, ll, ul])
    cutline.rings.add(ring)
    return cutline
  }

  createCutlineInProjection (envelope, srs) {
    var tx = new gdal.CoordinateTransformation(gdal.SpatialReference.fromEPSG(4326), srs)

    var ul = tx.transformPoint(envelope.west, envelope.north)
    var ur = tx.transformPoint(envelope.east, envelope.north)
    var lr = tx.transformPoint(envelope.east, envelope.south)
    var ll = tx.transformPoint(envelope.west, envelope.south)

    var cutline = new gdal.Polygon()
    var ring = new gdal.LinearRing()
    ring.points.add([ul, ur, lr, ll, ul])
    cutline.rings.add(ring)
    return cutline
  }

  gdalInfo (ds, image) {
    let info = ''
    let size = ds.rasterSize
    if (ds.rasterSize) {
      info += 'width: ' + ds.rasterSize.x + '\n'
      info += 'height: ' + ds.rasterSize.y + '\n'
    }
    let geotransform = ds.geoTransform
    if (geotransform) {
      info += 'Origin = (' + geotransform[0] + ', ' + geotransform[3] + ')\n'
      info += 'Pixel Size = (' + geotransform[1] + ', ' + geotransform[5] + ')\n'
      info += 'GeoTransform =\n'
      info += geotransform + '\n'
    }

    let layer = ds.layers
    info += 'DataSource Layer Count ' + layer.count() + '\n'
    for (var i = 0; i < layer.count(); i++) {
      info += 'Layer ' + i + ': ' + layer.get(i) + '\n'
    }

    // if (image) {
    //   info += 'FileDirectory\n'
    //   for (let key in image.fileDirectory) {
    //     let varName = key.charAt(0).toLowerCase() + key.slice(1) + 's'
    //     console.log('varName', varName)
    //     let globals = GeoTIFFGlobals[varName]
    //     if (globals) {
    //       for (const globalKey in globals) {
    //         let globalValue = globals[globalKey]
    //         console.log('\tGlobal Key: ' + globalKey + ': Global Value: ' + globalValue)
    //         if (globalValue === image.fileDirectory[key]) {
    //           info += '\t' + key + ': ' + globalKey + ' (' + image.fileDirectory[key] + ')\n'
    //         }
    //       }
    //     } else {
    //       info += '\t' + key + ': ' + image.fileDirectory[key] + '\n'
    //     }
    //     // JSON.stringify(image.fileDirectory, null, 2)
    //   }
    // }

    info += 'srs: ' + (ds.srs ? ds.srs.toPrettyWKT() : 'null') + '\n'
    if (!ds.srs) return info
    // corners
    let corners = {
      'Upper Left  ': {x: 0, y: 0},
      'Upper Right ': {x: size.x, y: 0},
      'Bottom Right': {x: size.x, y: size.y},
      'Bottom Left ': {x: 0, y: size.y}
    }

    let wgs84 = gdal.SpatialReference.fromEPSG(4326)
    let coordTransform = new gdal.CoordinateTransformation(ds.srs, wgs84)

    info += 'Corner Coordinates:'
    let cornerNames = Object.keys(corners)

    let coordinateCorners = []

    cornerNames.forEach(function (cornerName) {
      // convert pixel x,y to the coordinate system of the raster
      // then transform it to WGS84
      let corner = corners[cornerName]
      let ptOrig = {
        x: geotransform[0] + corner.x * geotransform[1] + corner.y * geotransform[2],
        y: geotransform[3] + corner.x * geotransform[4] + corner.y * geotransform[5]
      }
      let ptWgs84 = coordTransform.transformPoint(ptOrig)
      info += `${cornerName} (${Math.floor(ptOrig.x * 100) / 100}, ${Math.floor(ptOrig.y * 100) / 100}) (${gdal.decToDMS(ptWgs84.x, 'Long')}, ${gdal.decToDMS(ptWgs84.y, 'Lat')})\n`
      coordinateCorners.push([ptWgs84.x, ptWgs84.y])
    })

    ds.bands.forEach(function (band) {
      info += `Band ${band.id} Block=${band.blocksize ? band.blocksize.x : 0}${band.blocksize ? band.blocksize.y : 0} Type=${band.dataType}, ColorInterp=${band.colorInterpretation}\n`

      if (band.description) {
        info += '  Description = ' + band.description + '\n'
      }
      info += '  Min=' + Math.floor(band.minimum * 1000) / 1000 + '\n'
      info += '  Max=' + Math.floor(band.maximum * 1000) / 1000 + '\n'
      if (band.noDataValue !== null) {
        info += '  NoData Value=' + band.noDataValue + '\n'
      }

      // band overviews
      let overviewInfo = []
      band.overviews.forEach(function (overview) {
        let overviewDescription = overview.size.x + 'x' + overview.size.y

        let metadata = overview.getMetadata()
        if (metadata['RESAMPLING'] === 'AVERAGE_BIT2') {
          overviewDescription += '*'
        }

        overviewInfo.push(overviewDescription)
      })

      if (overviewInfo.length > 0) {
        info += '  Overviews: ' + overviewInfo.join(', ') + '\n'
      }
      if (band.hasArbitraryOverviews) {
        info += '  Overviews: arbitrary' + '\n'
      }
      if (band.unitType) {
        info += '  Unit Type: ' + band.unitType + '\n'
      }

      // category names
      let categoryNames = band.categoryNames
      if (categoryNames.length > 0) {
        info += '  Category Names: ' + '\n'
        for (var i = 0; i < categoryNames.length; i++) {
          info += '    ' + i + ': ' + categoryNames[i] + '\n'
        }
      }

      if (band.scale !== 1 || band.offset !== 0) {
        info += '  Offset: ' + band.offset + ',   Scale: ' + band.scale + '\n'
      }

      // band metadata
      let metadata = band.getMetadata()
      let keys = Object.keys(metadata)
      if (keys.length > 0) {
        info += '  Metadata:' + '\n'
        keys.forEach(function (key) {
          info += '    ' + key + '=' + metadata[key] + '\n'
        })
      }

      metadata = band.getMetadata('IMAGE_STRUCTURE')
      keys = Object.keys(metadata)
      if (keys.length > 0) {
        info += '  Image Structure Metadata:' + '\n'
        keys.forEach(function (key) {
          info += '    ' + key + '=' + metadata[key] + '\n'
        })
      }
    })
    return info
  }
}
