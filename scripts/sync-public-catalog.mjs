import fs from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";

const root=new URL("../",import.meta.url);
const source=stripTypeScriptTypes(await fs.readFile(new URL("lib/public-product.ts",root),"utf8"));
const {publicProduct}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const catalog=JSON.parse(await fs.readFile(new URL("lib/catalog-data.json",root),"utf8"));
const categoryKey=value=>value.toLowerCase().replaceAll(" ","-");
const safe=catalog.map(product=>publicProduct({...product,category:categoryKey(product.category),categories:product.categories.map(categoryKey)}));
await fs.writeFile(new URL("lib/public-catalog-data.json",root),JSON.stringify(safe,null,2)+"\n");
console.log(`Prepared ${safe.length} public catalog records.`);
