(function () {
  'use strict';
  // Babylon's bundle probes localStorage with setItem('test')/removeItem('test')
  // during import. Give this document memory-only storage BEFORE loading it.
  // Never obtain a reference to the browser's real storage in this script.
  function memoryStorage() {
    const values=new Map();
    function key(value) {
      const name=String(value);
      if(name.startsWith('track_'))throw new Error('Track storage is outside this synthetic demo.');
      return name;
    }
    return Object.freeze({
      get length(){return values.size;},
      key(index){return [...values.keys()][index]??null;},
      getItem(name){return values.get(key(name))??null;},
      setItem(name,value){values.set(key(name),String(value));},
      removeItem(name){values.delete(key(name));},
      clear(){values.clear();}
    });
  }
  for(const name of ['localStorage','sessionStorage']) {
    Object.defineProperty(window,name,{value:memoryStorage(),writable:false,configurable:false});
  }
  Object.defineProperty(window,'indexedDB',{get(){throw new Error('Persistent databases are disabled in this demo.');},configurable:false});
})();
