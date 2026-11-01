import ObjectUtil from "../util/ObjectUtil.js";
import ArrayUtil from "../util/ArrayUtil.js";
import TypeTester from "../util/TypeTester.js";

function makeFilter(props) {
    return props == null
        ? key => !key.startsWith("_") && key !== "getData" && key !== "clone"
        : key => props.includes(key);
}

class BaseStructure {
    static defaultValues = {};

    static dataProps = null;
    static nullableDataProps = [];

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);

        delete this.getData;
        delete this.clone;
        delete this.shallowProps;

        delete this._childGetData;
        delete this._childClone;
        delete this._childShallowProps;

        const proto = Object.getPrototypeOf(this);

        this._childGetData = proto.getData;
        this.getData = this._getData.bind(this);

        this._childClone = proto.clone;
        this.clone = this._clone.bind(this);

        this._childShallowProps = proto.shallowProps;
        this.shallowProps = this._shallowProps.bind(this);
    }

    _getData(prefix = "", nullable = true, props = undefined) {
        if (typeof props === "undefined") {
            props = this.constructor.dataProps;
        }

        const filter = makeFilter(props);

        let data = ObjectUtil.filterObject(this, filter);

        if (typeof this._childGetData === "function") {
            data = this._childGetData.call(this, data, prefix, nullable, props) ?? data;
        }

        if (nullable) {
            const nullables = (this.constructor.nullableDataProps ?? []).filter(
                prop => props == null || props.includes(prop)
            );

            for (const prop of nullables) {
                const defaultValue = this.constructor.defaultValues[prop];

                if (data[prop] == null || data[prop] === defaultValue) {
                    data[prop] = null;
                }
            }
        }

        return Object.fromEntries(Object.entries(data).map(([key, val]) => [prefix + key, val]));
    }

    _shallowProps(options) {
        const shallow =
            typeof this._childShallowProps === "function"
                ? this._childShallowProps.call(this, options)
                : options.shallow;

        return ArrayUtil.guaranteeSet(shallow);
    }

    _clone(overrides = {}, options = {}) {
        overrides = ObjectUtil.guaranteeObject(overrides);
        options = ObjectUtil.guaranteeObject(options);

        const data = this.getData("", false),
            shallow = this.shallowProps(options);

        for (const [key, val] of Object.entries(data)) {
            if (shallow.has(key) || !TypeTester.isObject(val)) {
                continue;
            }

            try {
                data[key] = structuredClone(val);
            } catch (err) {}
        }

        const instance = new this.constructor({ ...data, ...overrides }, overrides);

        if (typeof this._childClone === "function") {
            return this._childClone.call(this, instance, overrides, options) ?? instance;
        }

        return instance;
    }
}

export default BaseStructure;
