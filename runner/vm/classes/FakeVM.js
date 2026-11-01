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

    static timeElapsed(context) {
        return context.timeElapsed;
    }

    static timeRemaining(context) {
        return context.timeRemaining;
    }
}

export default FakeVM;
