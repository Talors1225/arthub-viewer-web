// Explicit resource links: never infer forms from matching names or adjacent IDs.
// change_out belongs to the outgoing model; change_in to the incoming model.
// Reviewed against the installed catalog and ship_skin_template.change_skin;
// the client ordering is in CN/view/newmain/view/painting/mainlive2dpainting.lua
// and mainspinepainting.lua in AzurLaneTools/AzurLaneLuaScripts.
export const dualForms = Object.freeze([
 ['jinluhao_3', 'jinluhao_4'],
 ['antu_2', 'antu_3'],
 ['mojiaduoer_4', 'mojiaduoer_5'],
 ['siwanshi_3', 'siwanshi_4'],
 ['suweiaitongmeng_3', 'suweiaitongmeng_4'],
 ['yuekechengii_3', 'yuekechengii_4'],
 ['feiteliedadi_4', 'feiteliedadi_5'],
 ['jianwu_2', 'jianwu_3'],
 ['yunlong_2', 'yunlong_3'],
 ['i404_2', 'i404_3'],
].map(pair => Object.freeze(pair)));

export function linkedForm(id, catalog) {
 const pair = dualForms.find(pair => pair.includes(id));
 if (!pair) return null;
 const index = pair.indexOf(id), target = pair[1 - index];
 if (!catalog.some(model => model.id === target)) return null;
 return {target, index};
}
