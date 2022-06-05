import {program} from "commander";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import {generatePlanet, generatePlanetGltf} from "./helpers";

program.command("mesh")
    .description("generate a planet mesh")
    .argument("type", "the type of data to create")
    .argument("destination", "the output file")
    .action(async (type, destination) => {
        if (type === "planet") {
            const data = generatePlanet();
            await fs.promises.writeFile(destination, JSON.stringify(data), {encoding: "utf8"});
        } else {
            throw new Error("Can only generate ['Planet'] mesh");
        }
    });

program.command("mesh-gltf")
    .description("generate a planet mesh")
    .argument("type", "the type of data to create")
    .argument("destination", "the output file")
    .action(async (type, destination) => {
        if (type === "planet") {
            const data = generatePlanet();
            const json = await generatePlanetGltf(data);
            await fs.promises.writeFile(destination, json);
        } else {
            throw new Error("Can only generate ['Planet'] mesh");
        }
    });

program.command("image")
    .description("generate an image from a mesh")
    .argument("type", "the type of data to render")
    .argument("source", "the input file")
    .action(async (type, source) => {
        if (type === "planet") {
            const data = JSON.parse(await fs.promises.readFile(source, {encoding: "utf8"}));

            const browser = await puppeteer.launch({defaultViewport: {width: 256, height: 256}});
            const page = await browser.newPage();
            const pageContent = await fs.promises.readFile("./pixi/pixi-renderer.html", "utf8");
            await page.setContent(pageContent);
            await page.evaluate((data) => {
                // @ts-ignore
                loadPlanet(data);
            }, data);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
            await page.screenshot({ path: `${path.basename(source, path.extname(source))}.jpeg`, type: "jpeg" });
            await browser.close();
        } else {
            throw new Error("Can only render ['Planet'] image");
        }
    });

program.command("embed")
    .description("embed an image into a mesh")
    .argument("type", "the type of data to embed")
    .argument("source", "the input file")
    .action(async (type, source) => {
        if (type === "planet") {
            const data = JSON.parse(await fs.promises.readFile(source, {encoding: "utf8"}));
            const image = await fs.promises.readFile(`${path.basename(source, path.extname(source))}.jpeg`);
            data.image = `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`;
            await fs.promises.writeFile(source, JSON.stringify(data), {encoding: "utf8"});
        } else {
            throw new Error("Can only embed ['Planet'] image");
        }
    });

program.parse();