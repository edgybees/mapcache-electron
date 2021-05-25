import { app } from 'electron'
import store from '../.'
import cloneDeep from 'lodash/cloneDeep'
import isNil from 'lodash/isNil'
import keys from 'lodash/keys'
import { mapcache } from '../../../package.json'
import BaseMapUtilities from '../../lib/util/BaseMapUtilities'
import HttpUtilities from '../../lib/network/HttpUtilities'
import { mkdirSync, readdirSync, existsSync } from 'fs'
import jetpack from 'fs-jetpack'
import UniqueIDUtilities from '../../lib/util/UniqueIDUtilities'
import path from 'path'
import FileUtilities from '../../lib/util/FileUtilities'
import { CanvasKitCanvasAdapter } from '@ngageoint/geopackage'
import GeoPackageCommon from '../../lib/geopackage/GeoPackageCommon'
import FileConstants from '../../lib/util/FileConstants'

/**
 * Executes the necessary migration scripts based on current version of the store and the installation version of the store
 * @returns {Promise<boolean>}
 */
export async function runMigration (forceReset = false) {
  // Prevent GeoPackage from loading canvas kit wasm, as we do not need to execute any canvas related functions in background.js
  CanvasKitCanvasAdapter.initialized = true

  const migrations = {
    2: async function (state) {
      // setup initial state for tabNotification, mapZoom, and preview layer
      keys(state.UIState).forEach(projectId => {
        state.UIState[projectId].tabNotification = {0: false, 1: false, 2: false}
        state.UIState[projectId].mapZoom = 3
        state.UIState[projectId].previewLayer = null
      })

      // setup initial mapRenderingOrder, also set all layers to not be visible
      keys(state.Projects).forEach(projectId => {
        keys(state.Projects[projectId].sources).forEach(sourceId => {
          state.Projects[projectId].sources[sourceId].visible = false
        })
        keys(state.Projects[projectId].geopackages).forEach(geopackageId => {
          keys(state.Projects[projectId].geopackages[geopackageId].tables.tiles).forEach(table => {
            state.Projects[projectId].geopackages[geopackageId].tables.tiles[table].visible = false
          })
          keys(state.Projects[projectId].geopackages[geopackageId].tables.features).forEach(table => {
            state.Projects[projectId].geopackages[geopackageId].tables.features[table].visible = false
          })
        })
        state.Projects[projectId].mapRenderingOrder = []
      })
    },
    3: async function (state) {
      // setup initial BaseMaps
      state.BaseMaps = {
        baseMaps: BaseMapUtilities.getDefaultBaseMaps()
      }
    },
    4: async function (state) {
      // remove any existing credentials
      const projectKeys = keys(state.Projects)
      for (let i = 0; i < projectKeys.length; i++) {
        const projectId = projectKeys[i]
        const sourceKeys = keys(state.Projects[projectId].sources)
        for (let j = 0; j < sourceKeys.length; j++) {
          const sourceId = sourceKeys[j]
          delete state.Projects[projectId].sources[sourceId].credentials
        }
      }
    },
    5: async function (state) {
      // add network settings to default base maps
      state.BaseMaps.baseMaps.filter(baseMap => baseMap.readonly && baseMap.id < 3).forEach(baseMap => {
        baseMap.layerConfiguration.timeoutMs = HttpUtilities.DEFAULT_TIMEOUT
        baseMap.layerConfiguration.retryAttempts = HttpUtilities.DEFAULT_RETRY_ATTEMPTS
        baseMap.layerConfiguration.rateLimit = HttpUtilities.NO_LIMIT
      })
    },
    6: async function (state) {
      // ensure all base map ids are strings
      state.BaseMaps.baseMaps.map(baseMap => {
        baseMap.id = baseMap.id + ''
        baseMap.layerConfiguration.id = baseMap.id + ''
        return baseMap
      })
    },
    7: async function (state) {
      // migrates existing project sources and basemaps into new directory structure. cleans up lost directories

      // create projects directory
      const userDataDir = app.getPath('userData')
      const projectDir = path.join(userDataDir, FileConstants.PROJECT_DIRECTORY_IDENTIFIER)
      if (!existsSync(projectDir)) {
        mkdirSync(projectDir)
      }

      // create project directories
      keys(state.Projects).forEach(projectId => {
        const project = state.Projects[projectId]
        project.directory = FileUtilities.createNextAvailableProjectDirectory(userDataDir)

        // create source directories
        keys(state.Projects[projectId].sources).forEach(sourceId => {
          const source = state.Projects[projectId].sources[sourceId]
          source.sourceDirectory = FileUtilities.createNextAvailableSourceDirectory(project.directory)
          source.directory = FileUtilities.createNextAvailableLayerDirectory(source.sourceDirectory, false)

          let oldDir = path.join(userDataDir, sourceId)
          if (!existsSync(oldDir) && !isNil(source.sourceId)) {
            oldDir = path.join(userDataDir, source.sourceId)
          }

          console.log('old layer dir: ' + oldDir + '? ' + (existsSync(oldDir) ? ' exists' : ' not found'))
          console.log('new layer dir: ' + source.directory + '? ' + (existsSync(source.directory) ? ' exists' : ' not found'))

          // move source contents
          if (!existsSync(source.directory) && existsSync(oldDir)) {
            jetpack.move(oldDir, source.directory)
            console.log('moved content from ' + oldDir + ' to ' + source.directory)
          }
          // update source file references
          if (!isNil(source.filePath)) {
            source.filePath = source.filePath.replace(oldDir, source.directory)
          }
          if (!isNil(source.rasterFile)) {
            source.rasterFile = source.rasterFile.replace(oldDir, source.directory)
          }
          if (!isNil(source.geopackageFilePath)) {
            source.geopackageFilePath = source.geopackageFilePath.replace(oldDir, source.directory)
          }
        })
      })

      // create basemaps directory
      const baseMapsDir = path.join(userDataDir, FileConstants.BASEMAP_DIRECTORY_IDENTIFIER)
      if (!existsSync(baseMapsDir)) {
        mkdirSync(baseMapsDir)
      }

      state.BaseMaps.baseMaps.filter(baseMap => ['0','1','2','3'].indexOf(baseMap.id) === -1).map(baseMap => {
        // move base map contents to new directory
        const baseMapDir = FileUtilities.createNextAvailableBaseMapDirectory(userDataDir, false)
        const oldDir = path.join(userDataDir, baseMap.id)
        if (!existsSync(baseMapDir) && existsSync(oldDir)) {
          jetpack.move(oldDir, baseMapDir)
        }
        // update base map file references
        baseMap.directory = baseMapDir
        baseMap.layerConfiguration.directory = baseMapDir
        baseMap.layerConfiguration.sourceDirectory = baseMapDir
        if (!isNil(baseMap.layerConfiguration.filePath)) {
          baseMap.layerConfiguration.filePath = baseMap.layerConfiguration.filePath.replace(oldDir, baseMapDir)
        }
        if (!isNil(baseMap.layerConfiguration.rasterFile)) {
          baseMap.layerConfiguration.rasterFile = baseMap.layerConfiguration.rasterFile.replace(oldDir, baseMapDir)
        }
        if (!isNil(baseMap.layerConfiguration.geopackageFilePath)) {
          baseMap.layerConfiguration.geopackageFilePath = baseMap.layerConfiguration.geopackageFilePath.replace(oldDir, baseMapDir)
        }
        return baseMap
      })

      // delete all uuidv4 directories
      const uuidv4Dirs = readdirSync(userDataDir, { withFileTypes: true })
        .filter(dir => dir.isDirectory())
        .map(dir => dir.name)
        .filter(dir => dir.match(UniqueIDUtilities.V4_REGEX))
        .map(dir => path.join(userDataDir, dir))

      uuidv4Dirs.forEach(dir => {
        FileUtilities.rmDir(dir)
      })

      const projectKeys = keys(state.Projects)
      for (const projectId of projectKeys) {
        const geopackageIds = keys(state.Projects[projectId].geopackages)
        for (const geopackageId of geopackageIds) {
          const geopackage = state.Projects[projectId].geopackages[geopackageId]
          geopackage.tables = await GeoPackageCommon.getInternalTableInformation(geopackage.path)
        }
      }
    }
  }

  let success = true
  // check if store is out of date, if so, delete content
  let currentVersion = parseInt(store.state.Version ? store.state.Version.version : '-1')
  let installationVersion = parseInt(mapcache.store.version)
  if (currentVersion !== installationVersion) {
    // if the current version isn't set or this is a downgrade, reset state to this version's defaults, otherwise run the migration
    const requiresReset = forceReset || currentVersion < 1 || installationVersion < currentVersion
    if (!requiresReset) {
      let state = cloneDeep(store.state)
      for (let i = currentVersion + 1; i <= installationVersion; i++) {
        if (migrations[i]) {
          try {
            await migrations[i](state)
            // eslint-disable-next-line no-unused-vars
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Migration script failed: ' + i)
            console.error(e)
            success = false
          }
        } else {
          // eslint-disable-next-line no-console
          console.error('Migration script not found. exiting.')
          success = false
        }
      }
      if (success) {
        await Promise.all([
          store.dispatch('UIState/migrateState', {migratedState: state.UIState}),
          store.dispatch('URLs/migrateState', {migratedState: state.URLs}),
          store.dispatch('BaseMaps/migrateState', {migratedState: state.BaseMaps}),
          store.dispatch('Projects/migrateState', {migratedState: state.Projects}),
          store.dispatch('Version/setVersion', installationVersion)])
      }
    } else {
      // store version not set or major revision is off, delete store
      await Promise.all([
        store.dispatch('UIState/resetState'),
        store.dispatch('URLs/resetState'),
        store.dispatch('BaseMaps/resetState'),
        store.dispatch('Projects/resetState'),
        store.dispatch('Version/setVersion', installationVersion)])
    }
  }
  return success
}
