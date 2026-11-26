import {createRequire} from 'node:module';

import {fileURLToPath} from 'node:url';

import {resolve,dirname} from 'node:path';

import {mkdirSync,unlinkSync} from 'node:fs';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)), '..');

const output=resolve(repoRoot, 'node_modules/.cache/destination-brand-test.cjs');

mkdirSync(dirname(output),{recursive:true});

const require=createRequire(resolve(repoRoot,'package.json'));
const {build}=require('esbuild');
const {JSDOM}=require('jsdom');
const React=require('react');
const {createRoot}=require('react-dom/client');
const {act}=React;
const assert=require('node:assert/strict');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
for(const key of ['window','document','HTMLElement','Node','MutationObserver'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
document.documentElement.dataset.akBrandName='我的书房';
document.documentElement.dataset.akBrandIcon='/custom.svg';
// Exercise the real component and its DOM event subscription, not hook mocks.
try {
await build({absWorkingDir:repoRoot,define:{'import.meta.env.DEV':'false'},entryPoints:['frontend/plugins/akashic_clients/chat/src/navigation-destinations.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty','.svg':'text'},outfile:output});
const {IdentityDestinationRow}=require(output);
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(React.createElement(IdentityDestinationRow,{destination:{label:'Akashic',sessionId:'main'},brandIcon:'/custom.svg',mark:{},active:true,actions:[],onOpen(){}})));
assert.equal(document.querySelector('.destination-row__name strong').textContent,'我的书房');
assert.equal(document.querySelector('.chat-sidebar__brand-image')?.getAttribute('src'),'/custom.svg');
await act(async()=>{document.documentElement.dataset.akBrandName='新书房';
window.dispatchEvent(new window.Event('akashic-appearance-change'));
});
assert.equal(document.querySelector('.destination-row__name strong').textContent,'新书房');
await act(async()=>root.render(React.createElement(IdentityDestinationRow,{destination:{label:'工作入口'},brandIcon:'',mark:{},active:false,actions:[],onOpen(){}})));
assert.equal(document.querySelector('.destination-row__name strong').textContent,'工作入口');
assert.ok(document.querySelector('.chat-sidebar__mark'));
await act(async()=>root.unmount());
console.log('PASS: destination name/icon, live rename, explicit label and default mark');
} finally {
  dom.window.close();
  try { unlinkSync(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
