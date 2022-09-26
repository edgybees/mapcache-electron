import { L } from '../../vendor'

export default class LeafletRangeRingControl extends L.Control {
  rangeRingFunction

  constructor (options, rangeRingFunction) {
    let mergedOptions = {
      ...{
        position: 'topright',
        enabled: true
      },
      ...options
    }
    super(mergedOptions)
    this.rangeRingFunction = rangeRingFunction
  }

  onAdd () {
    const self = this
    let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    this._rangeRingLink = L.DomUtil.create('a', '', container)
    this._rangeRingLink.title = 'Range rings'
    this._rangeRingLink.innerHTML = `<svg style="width:24px;height:24px" viewBox="0 0 24 24">  <path fill="currentColor" d="M16,8H14V11H11V13H14V16H16V13H19V11H16M2,12C2,9.21 3.64,6.8 6,5.68V3.5C2.5,4.76 0,8.09 0,12C0,15.91 2.5,19.24 6,20.5V18.32C3.64,17.2 2,14.79 2,12M15,3C10.04,3 6,7.04 6,12C6,16.96 10.04,21 15,21C19.96,21 24,16.96 24,12C24,7.04 19.96,3 15,3M15,19C11.14,19 8,15.86 8,12C8,8.14 11.14,5 15,5C18.86,5 22,8.14 22,12C22,15.86 18.86,19 15,19Z" /></svg>`
    this._rangeRingLink.onclick = function (e) {
      self.rangeRingFunction()
      self.disable()
      e.stopPropagation()
      e.preventDefault()
    }.bind(this)

    this.disable = () => {
      this._rangeRingLink.onclick = function () {
      }
      L.DomUtil.addClass(this._rangeRingLink, 'leaflet-control-disabled')
    }

    this.enable = () => {
      this._rangeRingLink.onclick = function (e) {
        self.rangeRingFunction()
        e.stopPropagation()
        e.preventDefault()
      }.bind(this)
      if (L.DomUtil.hasClass(this._rangeRingLink, 'leaflet-control-disabled')) {
        L.DomUtil.removeClass(this._rangeRingLink, 'leaflet-control-disabled')
      }
    }

    return container
  }
}
