import "node:process";
import * as fs from "node:fs"
import Config from "./lib/Config";
import colors from "colors";
import Test from "./lib/Test";
import ValueAssertion from "./lib/ValueAssertion";
import console from "node:console";
import path from "node:path";
colors.enable();

const KNOWN_CMD_ARGS = new Set(["--dir", "-d", "--verbose", "-v", "--strict", "-s"]);

/**
 * Gets the named command line arguments of the current process.
 * @returns arg name -> arg value mapping (value is `""` is no associated value is provided)
 */
function getNamedCommandLineArguments():Record<string,string> {
    const args = process.argv;
    const out:Record<string,string> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('-') || arg.startsWith("--")) { // is argument name
            const argVal = args[i+1];
            if (argVal === undefined || argVal.startsWith('-') || argVal.startsWith("--")) out[arg] = "";
            else {
                out[arg] = argVal;
                i++;
            }
        }
    }

    return out;
}

type TestDir = { [k:string]:TestDir|Test[] };
/**
 * Extracts all `Test` objects from the given directory.
 * @param dirPath path to directory (if relative, it is interpreted relative to the CWD)
 * @returns Promise that resolves with the extracted tests
 */
function findTests(dirPath:string):Promise<TestDir> {
    if (!path.isAbsolute(dirPath)) dirPath = path.normalize(`${process.cwd()}/${dirPath}`);

    return Promise.all(fs.readdirSync(dirPath).map(filename => {
        const filepath = `${dirPath}/${filename}`;

        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) return findTests(filepath)
            .then(tests => [`/${filename}`, tests] as [string,TestDir]);
        else if (stat.isFile() && filename.endsWith(".ts") || filename.endsWith(".js")) {
            return import(filepath)
                .then(res => {
                    console.log(res);
                    
                    const tests:Test[] = [];
                    for (const exp of Object.values(res)) {
                        if (exp instanceof Test) tests.push(exp);
                    }
                    return [`/${filename}`, tests] as [string,Test[]];
                });
        }
        else return Promise.resolve([`/${filename}`, []] as [string,Test[]]); // not TS file, has no tests
    }))
    .then(res => {
        const out:TestDir = {};
        for (const item of res) {
            if (Object.values(item[1]).length !== 0) out[item[0]] = item[1];
        }

        return out;
    });
}


type TestResults = { [name:string]:TestResults|ValueAssertion.ResultPool|Test.ExecutionError };
function runTests(testDir:TestDir|Test[], prefix=""):Promise<TestResults> {
    if (Array.isArray(testDir)) {
        return Promise.all(testDir.map(test => test.run().catch(err => err instanceof Test.ExecutionError ? err : new Test.ExecutionError(-1, err))))
            .then(results => {
                const out:TestResults = {};
                for (let i = 0; i < results.length; i++) out[testDir[i].name] = results[i];
                return out;
            });
    }
    else {
        const entries = Object.entries(testDir);
        return Promise.all(entries.map(entry => runTests(entry[1])))
            .then(results => {
                const out:TestResults = {};
                for (let i= 0; i < results.length; i++) out[entries[i][0]] = results[i];
                return out;
            })
    }
}


type ResultStatus = "pass"|"fail"|"error"|"warning";
namespace ResultsStatus {
    export function style(str:string, status:ResultStatus) {
        if (str.startsWith('/')) str = str.endsWith(".ts") ? str.italic : colors.bold(str).italic; // style paths

        switch (status) {
            case "pass": return str.green;
            case "fail": return str.red;
            case "error": return str.bgRed;
            case "warning": return str.yellow;
        }
    }
}

function getResultStatus(results:TestResults|ValueAssertion.ResultPool|Test.ExecutionError):ResultStatus {
    if (Array.isArray(results)) return results.some(res => res.status === "fail") ? "fail" : "pass";
    else if (results instanceof Test.ExecutionError) return "error";
    else {
        const values = Object.values(results);
        if (values.some(v => getResultStatus(v) === "error")) return "error";
        else if (values.some(v => getResultStatus(v) === "fail")) return "fail";
        else return "pass";
    }
}


function logTestResults(results:TestResults|ValueAssertion.ResultPool|Test.ExecutionError, logger=console, prefix=""):void {
    if (Array.isArray(results)) {
        if (results.length === 0) logger.log(prefix, ResultsStatus.style("- ⚠️ No assertions found", "warning"));
        else results.forEach((res, i) => { // is result from single test
            const point = results.length === 1 ? "-" : `${i+1}.`;
            if (res.status === "pass") {
                let str = `${point} ✅`;
                if (res.name) str += ` (${res.name})`;
                if (res.note) str += ` - ${res.note}`;
                logger.log(prefix, ResultsStatus.style(str, "pass"));
    
            }
            else logger.log(
                prefix,
                ResultsStatus.style(
                    res.name ?
                        `${point} ❌ (${res.name}) - ${res.reason}` :
                        `${point} ❌ - ${res.reason}`,
                    "fail"
                )
            );
        });
    }
    else if (results instanceof Test.ExecutionError) {
        logger.log(prefix, ResultsStatus.style(`- ⛔ Stopped at assertion #${results.assertionIndex + 1} (${results.message})`, "error"));
    }
    else for (const name in results) {
        const val = results[name];

        logger.log(prefix, ResultsStatus.style(name, getResultStatus(val)));
        logTestResults(val, logger, prefix + "    ");
    }
}

function doTests(settings:Config.Settings):Promise<void> {
    const unknownArgNames = Object.keys(CMD_ARGS).filter(n => !KNOWN_CMD_ARGS.has(n));
    if (unknownArgNames.length !== 0) { // warn of unknown CMD arguments
        const msg = `Unknown command line argument(s): ${unknownArgNames.join(", ")}`.yellow;
        if (settings.strict) throw new Error(msg);
        else if (settings.verbose) console.warn(msg);
    }

    if (!fs.existsSync(settings.testDir)) throw new Error(`path "${settings.testDir}" does not exist.`);
    else if (!fs.statSync(settings.testDir).isDirectory) throw new Error(`path "${settings.testDir}" exists, but is not a directory.`);
    
    return findTests(settings.testDir)
    .then(tests => runTests(tests))
    .then(result => logTestResults(result, console));
}



/** Mapping of named command line arguments to their value. */
const CMD_ARGS = getNamedCommandLineArguments();
/** Settings extrapolated from the given command line arguments. */
const TEST_SETTINGS:Config.Settings = {
    testDir: CMD_ARGS["--dir"] ?? CMD_ARGS["-d"] ?? "./tests",
    verbose: "--verbose" in CMD_ARGS || "-v" in CMD_ARGS,
    strict: "--strict" in CMD_ARGS || "-s" in CMD_ARGS
};

doTests(TEST_SETTINGS);