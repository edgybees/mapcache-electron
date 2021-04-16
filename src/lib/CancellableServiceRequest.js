import axios from 'axios'
import _ from 'lodash'
import UniqueIDUtilities from './UniqueIDUtilities'
import { ipcRenderer, remote } from 'electron'
import ServiceConnectionUtils from './ServiceConnectionUtils'

export default class CancellableServiceRequest {
  source

  /**
   * If a request is currently active, call cancelToken function
   * and set state to cancelled to prevent additional retries
   */
  cancel () {
    if (!_.isNil(this.source)) {
      this.source.cancel(ServiceConnectionUtils.USER_CANCELLED_MESSAGE)
    }
  }

  /**
   * If a request is currently active, call cancelToken function
   * and set state to cancelled to prevent additional retries
   */
  timeout () {
    if (!_.isNil(this.source)) {
      this.source.cancel(ServiceConnectionUtils.TIMEOUT_MESSAGE)
    }
  }

  /**
   * Attempts to make a connection to the service endpoint
   *
   * Headers:
   *  - x-mapcache-auth-enabled allows the login action to occur
   *  - x-mapcache-timeout will perform a cancel of the request if response headers have no been received before the specified timeout value
   *  - x-mapcache-connection-id is the reference id, so that communication between electron's web request listeners and this class can be made

   * @param url
   * @param options
   * @returns {Promise<{dataURL: undefined, error: *}>}
   */
  async request (url, options) {
    let response = undefined
    const requestId = UniqueIDUtilities.createUniqueID()
    const requestTimeoutChannel = 'request-timeout-' + requestId
    const timeoutListener = () => {
      this.timeout()
    }
    try {
      const CancelToken = axios.CancelToken
      this.source = CancelToken.source()
      const request = {
        url: url,
        withCredentials: true,
        cancelToken: this.source.token
      }
      request.headers = {}
      if (options.allowAuth) {
        request.headers['x-mapcache-auth-enabled'] = true
      }
      if (options.timeout) {
        request.headers['x-mapcache-timeout'] = options.timeout
      }
      request.headers['x-mapcache-request-origin'] = remote.getCurrentWindow().id
      request.headers['x-mapcache-connection-id'] = requestId
      ipcRenderer.once(requestTimeoutChannel, timeoutListener)
      response = await axios(request)
    } finally {
      ipcRenderer.removeListener(requestTimeoutChannel, timeoutListener)
    }
    return response
  }
}
