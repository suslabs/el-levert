function diceDist(a, b) {
    if (typeof a !== "string" && typeof a !== typeof b) {
        return 0;
    } else if (a === b) {
        return 1;
    } else if (a.length === 1 && b.length === 1) {
        return 0;
    }

    const bg_a = Array(a.length - 1),
        bg_b = Array(b.length - 1);

    for (let i = 0; i < a.length; i++) {
        if (i === 0) {
            bg_a[i] = a.charCodeAt(i) << 16;
        } else if (i === a.length - 1) {
            bg_a[i - 1] |= a.charCodeAt(i);
        } else {
            bg_a[i] = (bg_a[i - 1] |= a.charCodeAt(i)) << 16;
        }
    }

    for (let i = 0; i < b.length; i++) {
        if (i === 0) {
            bg_b[i] = b.charCodeAt(i) << 16;
        } else if (i === b.length - 1) {
            bg_b[i - 1] |= b.charCodeAt(i);
        } else {
            bg_b[i] = (bg_b[i - 1] |= b.charCodeAt(i)) << 16;
        }
    }

    bg_a.sort();
    bg_b.sort();

    let m = 0,
        i = 0,
        j = 0;

    while (i < a.length - 1 && j < b.length - 1) {
        if (bg_a[i] === bg_b[j]) {
            m += 2;

            i++;
            j++;
        } else if (bg_a[i] < bg_b[j]) {
            i++;
        } else {
            j++;
        }
    }

    return m / (a.length + b.length - 2);
}

export default diceDist;
