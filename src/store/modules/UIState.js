import Vue from 'vue'

const state = {
}

const getters = {
  getUIStateByProjectId: (state) => (id) => {
    return state[id]
  }
}

const mutations = {
  addProjectState (state, {projectId}) {
    Vue.set(state, projectId, {
      extents: [-53.4, -79.1, 53.64, 79.1],
      drawBounds: {},
      boundsBeingDrawn: {},
      activeCount: 0
    })
  },
  setProjectExtents (state, {projectId, extents}) {
    state[projectId].extents = extents
  },
  deleteProject (state, projectId) {
    Vue.delete(state, projectId)
  }
}

const actions = {
  addProjectState ({ commit, state }, id) {
    commit('addProjectState', id)
  },
  setProjectExtents ({ commit, state }, {projectId, extents}) {
    commit('setProjectExtents', {projectId, extents})
  },
  deleteProject ({ commit, state }, projectId) {
    commit('deleteProject', projectId)
  }
}

const modules = {
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters,
  modules
}
