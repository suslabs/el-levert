const PreviewErrorMessages = Object.freeze({
    invalidInput: "Invalid input",
    notFound: "not found"
});

const ignoredPreviewErrors = Object.freeze(Object.values(PreviewErrorMessages));

export { PreviewErrorMessages, ignoredPreviewErrors };
