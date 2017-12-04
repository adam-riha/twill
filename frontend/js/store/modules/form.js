import api from '../api/form'
import * as types from '../mutation-types'

const state = {
  title: window.STORE.form.title || '',
  permalink: window.STORE.form.permalink || '',
  baseUrl: window.STORE.form.baseUrl || '',
  fields: window.STORE.form.fields || [],
  saveUrl: window.STORE.form.saveUrl || ''
}

// getters
const getters = {}

const mutations = {
  [types.UPDATE_FORM_TITLE] (state, newValue) {
    if (newValue && newValue !== '') {
      state.title = newValue
    }
  },
  [types.UPDATE_FORM_PERMALINK] (state, newValue) {
    if (newValue && newValue !== '') {
      state.permalink = newValue
    }
  },
  [types.UPDATE_FORM_FIELD] (state, field) {
    const fieldToUpdate = state.fields.filter(function (f) {
      return f.name === field.name
    })

    // Update existing form field
    if (fieldToUpdate.length) {
      if (field.locale) {
        fieldToUpdate[0].value[field.locale] = field.value
      } else {
        fieldToUpdate[0].value = field.value
      }
    } else {
      // Or Create a new form field
      if (field.locale) {
        const localeValue = {}
        localeValue[field.locale] = field.value

        state.fields.push({
          name: field.name,
          value: localeValue
        })
      } else {
        state.fields.push({
          name: field.name,
          value: field.value
        })
      }
    }
  },
  [types.REMOVE_FORM_FIELD] (state, fieldName) {
    state.fields.forEach(function (field, index) {
      if (field.name === fieldName) state.fields.splice(index, 1)
    })
  }
}

const actions = {
  saveFormData ({ commit, state, getters, rootState }, saveType) {
    let fields = state.fields.filter((field) => {
      // we start by filtering out blocks related form fields
      return !field.name.startsWith('blocks[')
    }).reduce((fields, field) => {
      // and we create a new object with field names as keys,
      // to inline fields in the submitted data
      fields[field.name] = field.value
      return fields
    }, {})

    // we can now create our submitted data object out of:
    // - our just created fields object,
    // - publication properties
    // - selected medias and browsers
    // - created blocks and repeaters
    let data = Object.assign(fields, {
      cmsSaveType: saveType,
      published: rootState.publication.published,
      public: rootState.publication.visibility === 'public',
      publish_start_date: rootState.publication.startDate,
      publish_end_date: rootState.publication.endDate,
      languages: rootState.language.all,
      medias: gatherSelected(rootState.mediaLibrary.selected),
      browsers: gatherSelected(rootState.browser.selected),
      blocks: rootState.content.blocks.map(block => {
        return buildBlock(block, state, rootState)
      }),
      repeaters: gatherRepeaters(state, rootState)
    })

    console.table(data)

    api.save(state.saveUrl, data, function (resp) {
      if (resp.data.hasOwnProperty('redirect')) {
        window.location.replace(resp.data.redirect)
      }

      commit('setNotification', { message: resp.data.message, variant: resp.data.variant })
    })
  }
}

const isBlockField = (name, id) => {
  return name.startsWith('blocks[' + id + ']')
}

const stripOutBlockNamespace = (name, id) => {
  return name.replace('blocks[' + id + '][', '').slice(0, -1)
}

/*
* Gather selected items in a selected object (currently used for medias and browsers)
* if a block is passed as second argument, we retrieve selected items namespaced by the block id
* and strip it out from the key to clean things up and make it easier for the backend
*/
const gatherSelected = (selected, block = null) => {
  return Object.assign({}, ...Object.keys(selected).map(key => {
    if (block) {
      if (isBlockField(key, block.id)) {
        return {
          [stripOutBlockNamespace(key, block.id)]: selected[key]
        }
      }
    } else if (!key.startsWith('blocks[')) {
      return {
        [key]: selected[key]
      }
    }
    return null
  }).filter(x => x))
}

const buildBlock = (block, state, rootState) => {
  return {
    type: block.type,
    // retrieve all fields for this block and clean up field names
    content: state.fields.filter((field) => {
      return isBlockField(field.name, block.id)
    }).map((field) => {
      return {
        name: stripOutBlockNamespace(field.name, block.id),
        value: field.value
      }
    }).reduce((content, field) => {
      content[field.name] = field.value
      return content
    }, {}),
    medias: gatherSelected(rootState.mediaLibrary.selected, block),
    browsers: gatherSelected(rootState.browser.selected, block),
    // gather repeater blocks from the repeater store module
    blocks: Object.assign({}, ...Object.keys(rootState.repeaters.repeaters).filter(repeaterKey => {
      return repeaterKey.startsWith('blocks-' + block.id)
    }).map(repeaterKey => {
      return {
        [repeaterKey.replace('blocks-' + block.id + '_', '')]: rootState.repeaters.repeaters[repeaterKey].map(repeaterItem => {
          return buildBlock(repeaterItem, state, rootState)
        })
      }
    }))
  }
}

const gatherRepeaters = (state, rootState) => {
  return Object.assign({}, ...Object.keys(rootState.repeaters.repeaters).filter(repeaterKey => {
      // we start by filtering out repeater blocks
    return !repeaterKey.startsWith('blocks-')
  }).map(repeater => {
    return {
      [repeater]: rootState.repeaters.repeaters[repeater].map(repeaterItem => {
        // and for each repeater we build a block for each item
        let repeaterBlock = buildBlock(repeaterItem, state, rootState)

        // we want to inline fields in the repeater object
        let fields = repeaterBlock.fields.reduce((fields, field) => {
          fields[field.name] = field.value
          return fields
        }, {})

        delete repeaterBlock.fields

        return Object.assign(repeaterBlock, fields)
      })
    }
  }))
}

export default {
  state,
  getters,
  mutations,
  actions
}
