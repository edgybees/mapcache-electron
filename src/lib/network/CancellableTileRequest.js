import axios from 'axios'
import isNil from 'lodash/isNil'
import { USER_CANCELLED_MESSAGE, isNotFoundError } from './HttpUtilities'

export default class CancellableTileRequest {
  cancelled = false
  source
  axiosRequestScheduler
  requestTimeoutFunction
  responseReceived = false
  convertPbfToDataUrl

  constructor (isElectron = false) {
    if (isElectron) {
      const { convertPbfToDataUrl } = require('../util/rendering/MBTilesUtilities')
      this.convertPbfToDataUrl = convertPbfToDataUrl
    } else {
      this.convertPbfToDataUrl = window.mapcache.convertPbfToDataUrl
    }
  }

  /**
   * If a request is currently active, call cancelToken function
   * and set state to cancelled to prevent additional retries
   */
  cancel () {
    this.cancelled = true
    if (!isNil(this.source)) {
      const token = this.source.token
      this.source.cancel(USER_CANCELLED_MESSAGE)
      if (!isNil(this.axiosRequestScheduler)) {
        this.axiosRequestScheduler.cancel(token)
      }
    }
  }


  /**
   * Returns the data url of the response, or an error
   * @param axiosRequestScheduler
   * @param url
   * @param retryAttempts
   * @param timeout
   * @param withCredentials
   * @param size
   * @returns {Promise<{dataURL: undefined, error: *}>}
   */
  async requestTile (axiosRequestScheduler, url, retryAttempts, timeout, withCredentials = false, size) {
    let dataUrl = null
    let attempts = 0
    let error = null

    this.axiosRequestScheduler = axiosRequestScheduler
    while (!this.cancelled && isNil(dataUrl) && attempts <= retryAttempts) {
      try {
        const CancelToken = axios.CancelToken
        this.source = CancelToken.source()
        let response = await axiosRequestScheduler.getAxiosInstance()({
          url: url,
          responseType: 'arraybuffer',
          cancelToken: this.source.token,
          timeout: timeout,
          withCredentials
        })
        const dataBuffer = Buffer.from(response.data)
        if (response.headers['content-type'] === 'image/pbf' || response.headers['content-type'] === 'application/x-protobuf') {
          dataUrl = this.convertPbfToDataUrl(dataBuffer, size.x, size.y)
        } else {
          dataUrl = 'data:' + response.headers['content-type'] + ';base64,' + dataBuffer.toString('base64')
        }
        error = null
      } catch (err) {
        error = err

        // if it is an authentication error, stop retrying
        if (!isNil(err) && !isNil(err.response) && err.response.status === 401) {
          break
        }

        // if it is a timeout or the user cancelled the request, remove the error
        if (axios.isCancel(err) || (err.message && err.message.toLowerCase().indexOf('timeout') !== -1)) {
          error = null
          // if it is a not found error, we will ignore it and return
        } else if (isNotFoundError(err)) {
          error = null
          break
        }
      } finally {
        attempts++
      }
    }
    return {dataUrl, error}
  }
}
