import { Buffer } from "node:buffer";

class AttachmentBuilder {
    constructor(data, options = {}) {
        this.attachment = Buffer.isBuffer(data) ? data : Buffer.from(data ?? "");
        this.name = options.name ?? "file.txt";
        this.contentType = options.contentType ?? "application/octet-stream";
    }
}

class EmbedBuilder {
    constructor(data = {}) {
        this.data = { ...data };
    }

    setTitle(title) {
        this.data.title = title;
        return this;
    }

    setDescription(description) {
        this.data.description = description;
        return this;
    }

    setColor(color) {
        this.data.color = color;
        return this;
    }

    setAuthor(author) {
        if (author == null) {
            delete this.data.author;
            return this;
        }

        const icon_url = author.icon_url ?? author.iconURL;

        this.data.author = {
            ...author,
            ...(icon_url == null ? {} : { icon_url })
        };

        delete this.data.author.iconURL;
        return this;
    }

    setFooter(footer) {
        if (footer == null) {
            delete this.data.footer;
            return this;
        }

        const icon_url = footer.icon_url ?? footer.iconURL;

        this.data.footer = {
            ...footer,
            ...(icon_url == null ? {} : { icon_url })
        };

        delete this.data.footer.iconURL;
        return this;
    }

    addFields(...fields) {
        const normalized = fields.flat().filter(Boolean);

        this.data.fields ??= [];
        this.data.fields.push(...normalized);

        return this;
    }

    setTimestamp(timestamp = Date.now()) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        this.data.timestamp = date.toISOString();

        return this;
    }

    setImage(url) {
        this.data.image = url == null ? undefined : { url };
        return this;
    }

    setThumbnail(url) {
        this.data.thumbnail = url == null ? undefined : { url };
        return this;
    }

    setURL(url) {
        this.data.url = url;
        return this;
    }

    toJSON() {
        return { ...this.data };
    }
}

export { AttachmentBuilder, EmbedBuilder };
