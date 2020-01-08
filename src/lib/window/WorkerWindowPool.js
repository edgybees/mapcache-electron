import {BrowserWindow, ipcMain} from 'electron'
import _ from 'lodash'
import fs from 'fs'

class WorkerWindowPool {
  windowPoolSize = 4
  workerWindows = []
  workerWindowAssignment = {}

  launchWorkerWindows () {
    // create hidden worker window
    for (let id = 0; id < this.windowPoolSize; id++) {
      let worker = {
        id: id,
        window: new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: true
          }
        }),
        available: false
      }
      worker.window.toggleDevTools()
      // worker.window.toggleDevTools()
      this.workerWindows.push(worker)
      const workerURL = process.env.NODE_ENV === 'development'
        ? `http://localhost:9080/?id=${id}#/worker`
        : `file://${__dirname}/index.html?id=${id}#worker`
      worker.window.loadURL(workerURL)
      worker.window.on('ready-to-show', () => {
        worker.available = true
      })
    }
  }

  async getOrWaitForAvailableWorker (sourceId) {
    const sleep = m => new Promise(resolve => setTimeout(resolve, m))
    let availableWorker = null
    while (_.isNil(availableWorker)) {
      for (let i = 0; i < this.workerWindows.length; i++) {
        const worker = this.workerWindows[i]
        if (worker.available === true) {
          availableWorker = worker
          break
        }
      }
      // sleep so we don't lock down the application
      if (_.isNil(availableWorker)) {
        await sleep(500)
      }
    }
    availableWorker.available = false
    this.workerWindowAssignment[sourceId] = availableWorker
    return availableWorker
  }

  releaseWorker (worker, sourceId) {
    worker.available = true
    delete this.workerWindowAssignment[sourceId]
  }

  async executeProcessSource (payload) {
    return new Promise(async (resolve) => {
      const workerWindow = await this.getOrWaitForAvailableWorker()
      this.workerWindowAssignment[payload.source.id] = workerWindow
      workerWindow.window.webContents.send('worker_process_source', payload)
      ipcMain.once('worker_process_source_completed_' + workerWindow.id, (event, result) => {
        this.releaseWorker(workerWindow, payload.source.id)
        resolve(result)
      })
    })
  }

  cancelProcessSource (sourceId) {
    if (this.workerWindowAssignment[sourceId]) {
      const workerWindow = this.workerWindowAssignment[sourceId]
      const workerURL = process.env.NODE_ENV === 'development'
        ? `http://localhost:9080/?id=${workerWindow.id}#/worker`
        : `file://${__dirname}/index.html?id=${workerWindow.id}#worker`
      workerWindow.window.loadURL(workerURL)
      workerWindow.window.on('ready-to-show', () => {
        this.releaseWorker(workerWindow, sourceId)
      })
      delete this.workerWindowAssignment[sourceId]
    }
  }

  async executeBuildGeoPackage (payload) {
    return new Promise(async (resolve) => {
      const workerWindow = await this.getOrWaitForAvailableWorker()
      this.workerWindowAssignment[payload.geopackage.id] = workerWindow
      workerWindow.window.webContents.send('worker_build_geopackage', payload)
      ipcMain.once('worker_build_geopackage_completed_' + workerWindow.id, (event, result) => {
        this.releaseWorker(workerWindow, payload.geopackage.id)
        resolve(result)
      })
    })
  }

  cancelGeoPackageBuild (geopackage) {
    const geopackageId = geopackage.id
    try {
      fs.unlinkSync(geopackage.fileName)
    } catch (error) {
      console.error(error)
    }

    try {
      if (this.workerWindowAssignment[geopackageId]) {
        const workerWindow = this.workerWindowAssignment[geopackageId]
        const workerURL = process.env.NODE_ENV === 'development'
          ? `http://localhost:9080/?id=${workerWindow.id}#/worker`
          : `file://${__dirname}/index.html?id=${workerWindow.id}#worker`
        workerWindow.window.loadURL(workerURL)
        workerWindow.window.on('ready-to-show', () => {
          this.releaseWorker(workerWindow, geopackageId)
        })
        delete this.workerWindowAssignment[geopackageId]
      }
    } catch (error) {
      console.error(error)
    }
  }
}
export default new WorkerWindowPool()
