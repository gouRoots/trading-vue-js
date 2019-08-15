
// Main DataHelper class. A container for data,
// which works as a proxy and CRUD interface

export default class DataCube {

    constructor(data = {}) {

        this.data = data

        /* Examples of queries: (go to test #8) */
        /* Type in devtools:
            DataCube.get('onchart.EMA0') // Nope!
            DataCube.get('Keltner')      // By name
            DataCube.get_one('chart.data')
            DataCube.get('offchart.RSI')
            DataCube.get('offchart.RSI.data')
            DataCube.get('DI')
            DataCube.get('Splines0.data') // By index
            DataCube.get('Segment.settings')
            ...
            DataCube.set('.settings', { lineWidth: 2 })
            DataCube.add('offchart', { type: 'New', data: [] })
            DataCube.del('.')  // Fun !
            ...
            DataCube.hide('.')
            DataCube.show('offchart')
            DataCube.merge('RSI.settings', { color: 'green' })
        */

        // DEBUG
        window.DataCube = this

    }

    // Init Data Structure v1.1
    init_data($root) {

        if (!('chart' in this.data)) {
            this.Vue.$set(this.data, 'chart', {
                type: 'Candles',
                data: this.data.ohlcv || []
            })
        }

        if (!('onchart' in this.data)) {
            this.Vue.$set(this.data, 'onchart', [])
        }

        if (!('offchart' in this.data)) {
            this.Vue.$set(this.data, 'offchart', [])
        }

        if (!this.data.chart.settings) {
            this.Vue.$set(this.data.chart,'settings', {})
        }

        // Remove ohlcv cuz we have Data v1.1
        delete this.data.ohlcv

    }

    // Set vue instance (once)
    init_vue($root) {
        if (!this.Vue) {
            this.Vue = $root
            this.init_data()
            this.update_ids()
        }
    }

    // Update ids for all overlays
    update_ids() {
        this.data.chart.id = `chart.${this.data.chart.type}`
        var count = {}
        for (var ov of this.data.onchart) {
            if (count[ov.type] === undefined) {
                count[ov.type] = 0
            }
            let i = count[ov.type]++
            ov.id = `onchart.${ov.type}${i}`
            if (!ov.name) ov.name = ov.id
            if (!ov.settings) ov.settings = {}

        }
        count = {}
        for (var ov of this.data.offchart) {
            if (count[ov.type] === undefined) {
                count[ov.type] = 0
            }
            let i = count[ov.type]++
            ov.id = `offchart.${ov.type}${i}`
            if (!ov.name) ov.name = ov.id
            if (!ov.settings) ov.settings = {}
        }
    }


    // Add new overlay
    add(side, overlay) {

        if (side !== 'onchart' && side !== 'offchart') {
            return
        }

        this.data[side].push(overlay)
        this.update_ids()

        return overlay.id
    }

    // Get all objects matching the query
    get(query) {
        return this.get_by_query(query).map(x => x.v)
    }

    // Get first object matching the query
    get_one(query) {
        return this.get_by_query(query).map(x => x.v)[0]
    }

    // Set data (reactively)
    set(query, data) {

        let objects = this.get_by_query(query)

        for (var obj of objects) {

            let i = obj.i !== undefined ?
                obj.i :
                obj.p.indexOf(obj.v)

            if (i !== -1) {
                this.Vue.$set(obj.p, i, data)
            }
        }

        this.update_ids()

    }

    // Merge object or array (reactively)
    merge(query, data) {

        let objects = this.get_by_query(query)

        for (var obj of objects) {
            if (Array.isArray(obj.v)) {
                if (!Array.isArray(data)) continue
                // If array is a timeseries, merge it by timestamp
                // else merge by item index
                if (obj.v[0] && obj.v[0].length >= 2) {
                    this.merge_ts(obj, data)
                } else {
                    this.merge_objects(obj, data, [])
                }
            } else if (typeof obj.v === 'object') {
                this.merge_objects(obj, data)
            }
        }

        this.update_ids()

    }

    // Remove an overlay by query (id/type/name/...)
    del(query) {

        let objects = this.get_by_query(query)

        for (var obj of objects) {

            // Find current index of the field (if not defined)
            let i = obj.i !== undefined ?
                obj.i : obj.p.indexOf(obj.v)

            if (i !== -1) {
                this.Vue.$delete(obj.p, i)
            }

        }

        this.update_ids()
    }

    // Lock overlays from being pulled by query_search
    // TODO: subject to review
    lock(query) {
        let objects = this.get_by_query(query)
        objects.forEach(x => {
            if (x.v && x.v.id && x.v.type) {
                x.v.locked = true
            }
        })
    }

    // Unlock overlays from being pulled by query_search
    //
    unlock(query) {
        let objects = this.get_by_query(query, true)
        objects.forEach(x => {
            if (x.v && x.v.id && x.v.type) {
                x.v.locked = false
            }
        })
    }

    // Show indicator
    show(query) {
        if (query === 'offchart' || query === 'onchart') {
             query += '.'
        } else if (query === '.') {
            query = ''
        }
        this.merge(query + '.settings', { display: true })
    }

    // Hide indicator
    hide(query) {
        if (query === 'offchart' || query === 'onchart') {
             query += '.'
        } else if (query === '.') {
             query = ''
        }
        this.merge(query + '.settings', { display: false })
    }

    // Returns array of objects matching query.
    // Object contains { parent, index, value }
    // TODO: query caching
    get_by_query(query, chuck) {

        let tuple = query.split('.')

        switch (tuple[0]) {
            case 'chart':
                var result = this.chart_as_piv(tuple)
                break
            case 'onchart':
            case 'offchart':
                result = this.query_search(query, tuple)
                break
            default:
                /* Should get('.') return also the chart? */
                /*let ch = this.chart_as_query([
                    'chart',
                    tuple[1]
                ])*/
                let on = this.query_search(query, [
                    'onchart',
                    tuple[0],
                    tuple[1]
                ])
                let off = this.query_search(query, [
                    'offchart',
                    tuple[0],
                    tuple[1]
                ])
                result = [/*ch[0],*/ ...on, ...off]
                break
        }

        return result.filter(x => !x.v.locked || chuck)
    }

    chart_as_piv(tuple) {
        let field = tuple[1]
        if (field) return [{
            p: this.data.chart,
            i: field,
            v: this.data.chart[field]
        }]
        else return [{
            p: this.data,
            i: 'chart',
            v: this.data.chart
        }]
    }

    query_search(query, tuple) {

        let side = tuple[0]
        let path = tuple[1] || ''
        let field = tuple[2]

        let arr = this.data[side].filter(
            x => x.id && x.name && (
                 x.id === query ||
                 x.id.includes(path) ||
                 x.name === query ||
                 x.name.includes(path)
            ))

        if (field) {
            return arr.map(x => ({
                p: x,
                i: field,
                v: x[field]
            }))
        }

        return arr.map(x => ({
            p: this.data[side],
            i: undefined,
            v: x
        }))
    }

    merge_objects(obj, data, new_obj = {}) {

        // The only way to get Vue to update all stuff
        // reactively is to create a brand new object.
        // TODO: Is there a simpler approach?
        Object.assign(new_obj, obj.v)
        Object.assign(new_obj, data)
        this.Vue.$set(obj.p, obj.i, new_obj)

    }

    // Merge overlapping time series
    merge_ts(obj, data) {

        // Assume that both arrays are pre-sorted

        if (!data.length) return obj.v

        let r1 = [obj.v[0][0], obj.v[obj.v.length - 1][0]]
        let r2 = [data[0][0],  data[data.length - 1][0]]

        // Overlap
        let o = [Math.max(r1[0],r2[0]), Math.min(r1[1],r2[1])]

        if (o[1] >= o[0]) {

            let { od, d1, d2 } = this.ts_overlap(obj.v, data, o)

            obj.v.splice(...d1)
            data.splice(...d2)

            // Dst === Overlap === Src
            if (!obj.v.length && !data.length) {
                return od
            }

            // If src is totally contained in dst
            if (!data.length) { data = obj.v.splice(d1[0]) }

            // If dst is totally contained in src
            if (!obj.v.length) { obj.v = data.splice(d2[0]) }


            return this.combine(obj.v, od, data)

        } else {

            return this.combine(obj.v, [], data)

        }

    }

    // TODO: review performance, move to worker
    ts_overlap(arr1, arr2, range) {

        const t1 = range[0]
        const t2 = range[1]

        let ts = {} // timestamp map

        let a1 = arr1.filter(x => x[0] >= t1 && x[0] <= t2)
        let a2 = arr2.filter(x => x[0] >= t1 && x[0] <= t2)

        // Indices of segments
        let id11 = arr1.indexOf(a1[0])
        let id12 = arr1.indexOf(a1[a1.length - 1])
        let id21 = arr2.indexOf(a2[0])
        let id22 = arr2.indexOf(a2[a2.length - 1])

        for (var i = 0; i < a1.length; i++) {
            ts[a1[i][0]] = a1[i]
        }

        for (var i = 0; i < a2.length; i++) {
            ts[a2[i][0]] = a2[i]
        }

        let ts_sorted = Object.keys(ts).sort()

        return {
            od: ts_sorted.map(x => ts[x]),
            d1: [id11, id12 - id11 + 1],
            d2: [id21, id22 - id21 + 1]
        }

    }

    // Combine parts together:
    // (destination, overlap, source)
    combine(dst, o, src) {

        function last(arr) { return arr[arr.length - 1][0] }

        if (!dst.length) { dst = o; o = [] }
        if (!src.length) { src = o; o = [] }

        // The overlap right in the middle
        if (src[0][0] >= dst[0][0] && last(src) <= last(dst)) {

            return Object.assign(dst, o)

        // The overlap is on the right
        } else if (last(src) > last(dst)) {

            // Psh(...) is faster but can overflow the stack
            if (o.length < 100000 && src.length < 100000) {
                dst.push(...o, ...src)
                return dst
            } else {
                return dst.concat(o, src)
            }

        // The overlap is on the left
        } else if (src[0][0] < dst[0][0]) {

            // Push(...) is faster but can overflow the stack
            if (o.length < 100000 && src.length < 100000) {
                src.push(...o, ...dst)
                return src
            } else {
                return src.concat(o, dst)
            }

        } else {  return []  }

    }


}