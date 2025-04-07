class FakeVM {
    constructor() {
        this.vmProps = {};
    }

    static getCpuTime(context) {
        return context.isolate.cpuTime;
    }

    static getWallTime(context) {
        return context.isolate.wallTime;
    }
}

export default FakeVM;
