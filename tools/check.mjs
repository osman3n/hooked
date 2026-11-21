/* Ad-hoc state probe for debugging the HUD against real runtime values. */
import { launch } from './cdp.mjs';
import { serve } from './serve.mjs';

const { port, url, server } = await serve(0, '.');
const c = await launch({ width: 1100, height: 800, dpr: 1 });
try {
  await c.client.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 1400));
  const j = async expr => {
    const r = await c.client.send('Runtime.evaluate', {
      expression: `(()=>(${expr}))()`, returnByValue: true,
    });
    return r.result.value;
  };
  console.log('chip   :', await j('document.getElementById("codexCount").textContent'));
  console.log('known  :', await j('window.__hooked.state.knownCount()'));
  console.log('caught :', await j('Object.keys(window.__hooked.state.data.caught).length'));
  console.log('coins  :', await j('window.__hooked.state.data.coins'));
  console.log('total  :', await j('window.__hooked.CONTENT.CATCHES.length'));
  console.log('errors :', c.errors.length ? c.errors : 'none');
} finally {
  await c.close();
  server.close();
}
