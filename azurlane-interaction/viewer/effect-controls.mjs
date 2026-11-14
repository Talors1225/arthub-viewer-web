// Curated from the current public catalog and real-frame comparisons.
// Do not enable an arbitrary portrait just because it has an "effect" motion.
export const effectControlPortraits = Object.freeze({
 dafeng_7:'light',pulimaosi_3:'curtains',xinnong_5:'particles',xinnong_6:'curtains',xingdengbao_3:'smoke',
 aisaikesi_4:'delayed',baerdimo_5:'delayed',baifeng_3:'delayed',banerwei_3:'delayed',
 chaijun_6:'delayed',chuyue_2:'delayed',dulianglai_2:'delayed',feiteliekaer_3:'delayed',
 fengyun_4:'delayed',jian_3:'delayed',jianye_2:'delayed',jinjiang_2:'delayed',
 longwu_2:'delayed',luyijiushi_2:'delayed',nabulesi_2:'delayed',nengdai_3:'delayed',
 qiye_10:'delayed',rangbaer_4:'delayed',shi_2:'delayed',xingdengbao_2:'delayed',
 xinzexi_3:'delayed',xinzexi_5:'delayed',xukufu_3:'delayed',yanusi_7:'delayed',
 yunxian_2:'delayed',zhangwu_2:'delayed',
 aersasi_2:'clouds',kelaimengsuo_2:'clouds',xinnong_4:'rainbow',rangbaer_3:'clouds',
 yilishabai_6:'sky-light',huonululu_5:'fireworks',rangbaer_5:'clouds',
 xuefeng_3:'clouds',chaijun_5:'stage-light',
});
export const hasEffectControls = id => Object.hasOwn(effectControlPortraits,id);
