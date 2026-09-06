(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.ChatKeyboardInsetCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  class KeyboardInsetModel{
    constructor(options={}){
      this.thresholdPx=Math.max(
        40,
        Number(options.thresholdPx)||80
      );
    }

    compute(input={}){
      if(!input.focused)return 0;

      const layoutBottom=Math.max(
        1,
        Math.round(Number(input.layoutBottom)||1)
      );
      const visualTop=Math.max(
        0,
        Math.round(Number(input.visualTop)||0)
      );
      const visualHeight=Math.max(
        1,
        Math.round(Number(input.visualHeight)||1)
      );

      const visualBottom=Math.min(
        layoutBottom,
        visualTop+visualHeight
      );

      const occlusion=Math.max(
        0,
        layoutBottom-visualBottom
      );

      return occlusion>=this.thresholdPx
        ?occlusion
        :0;
    }
  }

  return{KeyboardInsetModel};
});
