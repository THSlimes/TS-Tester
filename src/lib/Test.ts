import { ExpectFunction, ValueAssertion } from "./assertions";


class Test {

    public readonly name:string;
    private readonly funct:(expect:ExpectFunction)=>void;

    public constructor(name:string, funct:(expect:ExpectFunction)=>void) {
        this.name = name;
        this.funct = funct;
    }

    public run():Promise<ValueAssertion.Result[]> {
        const [expect, pool] = ExpectFunction.get();

        return new Promise(async (resolve, reject) => {
            try {
                await this.funct(expect);
                resolve(pool);
            }
            catch (e) {
                reject(new Test.ExecutionError(e));
            }
        });
    }

}

namespace Test {

    export class ExecutionError extends Error {

        constructor(reason:any) {
            if (reason instanceof Error) reason = `${reason.name}: ${reason.message}`;

            super(reason);
        }

    }

}

export default Test;