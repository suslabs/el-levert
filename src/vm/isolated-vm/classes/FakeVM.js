class FakeVM {
    constructor(isolate) {
        this.isolate = isolate;

        this.vmProps = {};
    }

    getCpuTime() {
        return this.isolate.cpuTime;
    }

    getWallTime() {
        return this.isolate.wallTime;
    }
}

export default FakeVM;
