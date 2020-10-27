import _ from 'lodash'
export default class URLUtilities {
  static getBaseUrlAndQueryParams (url) {
    let query = ''
    let baseUrl = url.slice()
    let queryIndex = url.indexOf('?')
    if (queryIndex > 0) {
      query = url.substring(queryIndex + 1)
      baseUrl = url.substring(0, queryIndex)
    }
    let queryObject = {}
    const params = query.split('&')
    params.forEach(param => {
      const [key, value] = param.split('=')
      queryObject[key] = value
    })
    return {
      baseUrl: baseUrl,
      queryParams: queryObject
    }
  }
  static generateUrlWithQueryParams (url, queryParams) {
    let newUrl = url + '?'
    Object.keys(queryParams).forEach(key => {
      if (!_.isNil(key) && !_.isNil(queryParams[key])) {
        if (newUrl.endsWith('?')) {
          newUrl += key + '=' + queryParams[key]
        } else {
          newUrl += '&' + key + '=' + queryParams[key]
        }
      }
    })
    return newUrl
  }
  static isXYZ (url) {
    return url.toLowerCase().indexOf('{x}') > 0 && url.toLowerCase().indexOf('{y}') > 0 && url.toLowerCase().indexOf('{z}') > 0
  }
  static isWMS (url) {
    return url.toLowerCase().indexOf('wms') > 0
  }
  static isWFS (url) {
    return url.toLowerCase().indexOf('wfs') > 0
  }
}
