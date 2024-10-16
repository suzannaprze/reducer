import { sortBy } from 'lodash'

export const actionFactory = (stateName, t, api, resultFunc = json => json) => {
  const action = {}

  let getPromiseQueue = []

  action.DELETE = {
    REQUEST: (id) => (
      { type: t.DELETE.REQUEST, id }
    ),
    FAIL: (id, error) => (
      { type: t.DELETE.FAIL, id, error }
    ),
    CONFIRM: (id) => (
      {
        type: t.DELETE.CONFIRM,
        id,
        receivedAt: Date.now(),
      }
    ),
  }

  action.PUT = {
    REQUEST: (id, data) => (
      { type: t.PUT.REQUEST, id, data }
    ),
    FAIL: (id, data, error) => (
      { type: t.PUT.FAIL, id, data, error }
    ),
    CONFIRM: (id, data) => (
      {
        type: t.PUT.CONFIRM,
        id,
        data,
        receivedAt: Date.now(),
      }
    ),
  }

  action.POST = {
    REQUEST: (id, data) => (
      { type: t.POST.REQUEST, id, data }
    ),
    FAIL: (id, data, error) => (
      { type: t.POST.FAIL, id, data, error }
    ),
    CONFIRM: (id, data) => (
      {
        type: t.POST.CONFIRM,
        id,
        data,
        receivedAt: Date.now(),
      }
    ),
  }

  action.GET = {
    REQUEST: (id) => (
      { type: t.GET.REQUEST, id }
    ),
    FAIL: (id, error) => (
      { type: t.GET.FAIL, id, error }
    ),
    CONFIRM: (id, data) => (
      {
        id,
        data,
        type: t.GET.CONFIRM,
        receivedAt: Date.now(),
      }
    ),
    CACHE_HIT: (id, data) => (
      { type: t.GET.CACHE_HIT, id, data }
    ),
  }

  action.INDEX = {
    REQUEST: (params) => (
      { type: t.INDEX.REQUEST, params }
    ),
    FAIL: (params, error) => (
      { type: t.INDEX.FAIL, params, error }
    ),
    CONFIRM: (params, data, {
      sortOrder = ['orderInList', 'firstName', 'name', 'id'],
      subscribeFilter,
      shouldUpdateThings = false,
    } = {}) => (
      {
        params,
        subscribeFilter,
        shouldUpdateThings,
        data: sortOrder ? sortBy(data, sortOrder) : data,
        type: t.INDEX.CONFIRM,
        receivedAt: Date.now(),
      }
    ),
    CACHE_HIT: (id, data) => (
      { type: t.INDEX.CACHE_HIT, id, data }
    ),
  }

  const promise = {
    INDEX: (id, { sortOrder, subscribeFilter, shouldUpdateThings } = {}) => (
      dispatch => {
        dispatch(action.INDEX.REQUEST(id))
        return api.INDEX(id)
          .then(json => dispatch(action.INDEX.CONFIRM(id, resultFunc(json),
            { sortOrder, subscribeFilter, shouldUpdateThings })))
          .catch(e => {
            dispatch(action.INDEX.FAIL(id, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
    INDEX_BY_PARAMS: (params, { sortOrder, subscribeFilter } = {}) => (
      dispatch => {
        dispatch(action.INDEX.REQUEST(params))
        return api.INDEX_BY_PARAMS(params)
          .then(json => dispatch(action.INDEX.CONFIRM(params, resultFunc(json),
            { sortOrder, subscribeFilter })))
          .catch(e => {
            dispatch(action.INDEX.FAIL(params, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
    DELETE: (id) => (
      dispatch => {
        dispatch(action.DELETE.REQUEST(id))
        return api.DELETE(id)
          .then(() => dispatch(action.DELETE.CONFIRM(id)))
          .catch(e => {
            dispatch(action.DELETE.FAIL(id, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
    GET: (id) => (
      (dispatch, getState) => {
        const {
          GET: { requested },
        } = getState()[stateName].http.things[id] || {
          GET: { requested: false },
        }
        // If we already have an on-going request just wait for it to finish
        if (requested) {
          const queuePromise = new Promise(resolve => {
            getPromiseQueue.push(resolve)
          })
          return queuePromise.then(json =>
            action.GET.CONFIRM(id, resultFunc(json))
          )
        }

        dispatch(action.GET.REQUEST(id))
        return api.GET(id)
          .then(json => {
            getPromiseQueue.forEach(resolve => {
              resolve(json)
            })
            getPromiseQueue = []
            return dispatch(action.GET.CONFIRM(id, resultFunc(json)))
          })
          .catch(e => {
            dispatch(action.GET.FAIL(id, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
    POST: (id, data) => (
      dispatch => {
        dispatch(action.POST.REQUEST(id, data))
        return api.POST(data)
          .then(json => dispatch(action.POST.CONFIRM(id, resultFunc(json))))
          .catch(e => {
            dispatch(action.POST.FAIL(id, data, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
    PUT: (id, data) => (
      dispatch => {
        dispatch(action.PUT.REQUEST(id, data))
        return api.PUT(id, data)
          .then(() => dispatch(action.PUT.CONFIRM(id, data)))
          .catch(e => {
            dispatch(action.PUT.FAIL(id, data, e))
            dispatch({ type: 'ERROR', e })
            throw e
          })
      }
    ),
  }

  return {
    INDEX: (id, sortOrder) => dispatch => dispatch(promise.INDEX(id, sortOrder)),
    INDEX_CACHE: id => (
      (dispatch, getState) => {
        const {
          data,
          confirmed,
        } = getState()[stateName].http.collections[id] || {
          data: null,
          confirmed: false,
        }

        return dispatch(confirmed ?
          action.INDEX.CACHE_HIT(id, data) : promise.INDEX(id))
      }
    ),
    INDEX_BY_PARAMS: (params, sortOrder) => (
      dispatch => dispatch(promise.INDEX_BY_PARAMS(params, sortOrder))
    ),
    INDEX_BY_PARAMS_CACHE: params => (
      (dispatch, getState) => {
        const {
          data,
          confirmed,
        } = getState()[stateName].http.collections[params] || {
          data: null,
          confirmed: false,
        }

        return dispatch(confirmed ?
          action.INDEX.CACHE_HIT(params, data) : promise.INDEX_BY_PARAMS(params))
      }
    ),
    DELETE: id => dispatch => dispatch(promise.DELETE(id)),
    GET: id => dispatch => dispatch(promise.GET(id)),
    GET_CACHE: id => (
      (dispatch, getState) => {
        // Check cache before making request
        const {
          data,
          GET: { confirmed },
        } = getState()[stateName].http.things[id] || {
          data: null,
          GET: { confirmed: false },
        }

        return dispatch(confirmed ?
          action.GET.CACHE_HIT(id, data) : promise.GET(id))
      }
    ),
    POST: (id, data) => dispatch => dispatch(promise.POST(id, data)),
    PUT: (id, data) => (
      (dispatch, getState) => {
        const {
          data: oldData,
        } = getState()[stateName].http.things[id] || {
          data: {},
        }
        return dispatch(promise.PUT(id, { ...oldData, ...data }))
      }
    ),
    CLEAR_ERRORS: () => ({
      type: t.CLEAR_ERRORS,
    }),
    action,
    INSERT: (id, data) => ({
      type: t.INSERT,
      id,
      data,
    }),
    UPDATE: (id, data) => ({
      type: t.PUT.CONFIRM,
      id,
      data,
      receivedAt: Date.now(),
    }),
    REMOVE: (id) => ({
      type: t.DELETE.CONFIRM,
      id,
      receivedAt: Date.now(),
    }),
  }
}
