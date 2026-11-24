class MarkdownStyler {
    constructor() {
        this.styles = [];
    }

    start(style) {
        if (this.styles.includes(style)) {
            return "";
        }

        this.styles.push(style);
        return style;
    }

    end(style) {
        const idx = this.styles.lastIndexOf(style);

        if (idx === -1) {
            return "";
        }

        const closed = this.styles.splice(idx),
            reopened = closed.slice(1);

        this.styles.push(...reopened);
        return closed.reverse().join("") + reopened.join("");
    }

    reset() {
        const closed = this.styles.reverse().join("");
        this.styles = [];

        return closed;
    }
}

export default MarkdownStyler;
