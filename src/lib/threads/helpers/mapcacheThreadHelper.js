import path from 'path'
import {
  REQUEST_RENDER,
  REQUEST_PROCESS_SOURCE,
  REQUEST_ATTACH_MEDIA,
  REQUEST_GEOTIFF_RASTER,
  REQUEST_TILE_REPROJECTION,
  GEOPACKAGE_TABLE_RENAME,
  GEOPACKAGE_TABLE_DELETE,
  GEOPACKAGE_TABLE_COPY,
  GEOPACKAGE_TABLE_COUNT,
  GEOPACKAGE_TABLE_SEARCH
} from '../mapcacheThreadRequestTypes'

/**
 * MapcacheThreadHelper
 */
export default class MapcacheThreadHelper {
  threadPool

  constructor () {
    let file = path.join(__dirname, 'mapcacheThread.js')
    file = file.replace('app.asar', 'app.asar.unpacked')
    const os = require('os')
    const WorkerThreadPool = require('../pool/workerThreadPool').default
    console.log(os.cpus().length)
    const workerCount = Math.max(2, os.cpus().length)
    const config = []
    // perform tile rendering only
    config.push({
      types: [REQUEST_RENDER, REQUEST_TILE_REPROJECTION]
    })
    // perform any task
    for (let i = 1; i < workerCount; i++) {
      config.push({
        types: [REQUEST_RENDER, REQUEST_PROCESS_SOURCE, REQUEST_ATTACH_MEDIA, REQUEST_GEOTIFF_RASTER, REQUEST_TILE_REPROJECTION, GEOPACKAGE_TABLE_RENAME, GEOPACKAGE_TABLE_DELETE, GEOPACKAGE_TABLE_COPY, GEOPACKAGE_TABLE_COUNT, GEOPACKAGE_TABLE_SEARCH]
      })
    }

    this.threadPool = new WorkerThreadPool(config, file)
  }

  async initialize () {
    return this.threadPool.initialize()
  }

  /**
   * Returns whether the threadpool has any pending or active tasks
   * @returns {boolean}
   */
  hasTasks () {
    return this.threadPool.hasTasks()
  }

  /**
   * Attaches media to a geopackage
   * @param data
   * @returns {Promise<unknown>}
   */
  attachMedia (data) {
    return new Promise((resolve) => {
      this.threadPool.addTask({id: data.id, type: REQUEST_ATTACH_MEDIA, data: data}, null, (err, result) => {
        if (err) {
          result = { error: err }
        }
        resolve(result)
      })
    })
  }

  /**
   * Processes a data source
   * @param data
   * @param sender
   * @returns {Promise<unknown>}
   */
  processDataSource (data, sender) {
    return new Promise((resolve) => {
      // set up initial directory
      const directory = data.source.directory
      this.threadPool.addTask({id: data.id, type: REQUEST_PROCESS_SOURCE, data: data}, sender, (err, result) => {
        const isNil = require('lodash/isNil')
        if (!isNil(err)) {
          if (isNil(result)) {
            result = {}
          }
          result.error = err
          const { rmDirAsync } = require('../../util/file/FileUtilities')
          rmDirAsync(directory).then((err) => {
            if (err) {
              // eslint-disable-next-line no-console
              console.error('Failed to delete source directory.')
            }
            resolve(result)
          })
        }
        resolve(result)
      }, () => {
        const { rmDirAsync } = require('../../util/file/FileUtilities')
        rmDirAsync(directory).then((err) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.error('Failed to delete source directory.')
          }
          resolve({cancelled: true})
        })
      })
    })
  }

  /**
   * Renders a tile
   * @param data
   * @returns {Promise<unknown>}
   */
  renderTile (data) {
    return new Promise((resolve) => {
      this.threadPool.addTask({id: data.id, type: REQUEST_RENDER, data: data}, null, (err, result) => {
        if (err) {
          result = { error: err }
        }
        resolve(result)
      }, () => {
        resolve({ error: 'Cancelled by user'})
      })
    })
  }

  /**
   * Create geotiff raster
   * @param data
   * @returns {Promise<unknown>}
   */
  generateGeoTIFFRaster (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: REQUEST_GEOTIFF_RASTER, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Reprojects a tile reprojection request
   * @param data
   * @returns {Promise<unknown>}
   */
  reprojectTile (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: REQUEST_TILE_REPROJECTION, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Renames a geopackage table
   * @param data
   * @returns {Promise<unknown>}
   */
  renameGeoPackageTable (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: GEOPACKAGE_TABLE_RENAME, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Deletes a geopackage table
   * @param data
   * @returns {Promise<unknown>}
   */
  deleteGeoPackageTable (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: GEOPACKAGE_TABLE_DELETE, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Copies a geopackage table
   * @param data
   * @returns {Promise<unknown>}
   */
  copyGeoPackageTable (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: GEOPACKAGE_TABLE_COPY, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Counts features of a geopackage table
   * @param data
   * @returns {Promise<unknown>}
   */
  countGeoPackageTable (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: GEOPACKAGE_TABLE_COUNT, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Searches a geopackage table
   * @param data
   * @returns {Promise<unknown>}
   */
  searchGeoPackageTable (data) {
    return new Promise((resolve, reject) => {
      this.threadPool.addTask({id: data.id, type: GEOPACKAGE_TABLE_SEARCH, data: data}, null, (err, result) => {
        if (err) {
          reject(err)
        }
        resolve(result)
      })
    })
  }

  /**
   * Cancels a task, will terminate the thread running the task, if needed
   * @param id
   * @returns {Promise<void>}
   */
  async cancelTask (id) {
    await this.threadPool.cancelTask(id)
  }

  /**
   * Cancels a pending task
   * @param id
   * @returns {Promise<void>}
   */
  async cancelPendingTask (id) {
    await this.threadPool.cancelPendingTask(id)
  }

  /**
   * Terminates the thread pool and all of it's threads
   * @returns {Promise<void>}
   */
  async terminate () {
    await this.threadPool.close()
  }
}
