class Collection extends Map {
    static fromArray(values) {
        const out = new Collection();

        for (const value of values ?? []) {
            const id = value?.id;

            if (id != null) {
                out.set(id, value);
            }
        }

        return out;
    }

    first() {
        return this.values().next().value;
    }

    at(index) {
        return Array.from(this.values()).at(index);
    }

    last(count) {
        const values = Array.from(this.values());

        if (typeof count !== "number") {
            return values.at(-1);
        }

        return values.slice(-count);
    }

    find(predicate) {
        for (const [key, value] of this.entries()) {
            if (predicate(value, key, this)) {
                return value;
            }
        }

        return undefined;
    }

    filter(predicate) {
        const out = new Collection();

        for (const [key, value] of this.entries()) {
            if (predicate(value, key, this)) {
                out.set(key, value);
            }
        }

        return out;
    }

    map(mapper) {
        return Array.from(this.entries()).map(([key, value]) => mapper(value, key, this));
    }
}

export default Collection;
