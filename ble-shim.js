// Jembatan: membuat kode web (navigator.bluetooth) jalan di APK lewat plugin BLE native.
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

export function installShim(Ble, target) {
  const low = (u) => String(u).toLowerCase();
  const dv = (b) =>
    b instanceof DataView ? b : new DataView(b.buffer, b.byteOffset, b.byteLength);

  class Chr extends EventTarget {
    constructor(dev, svc, uuid) {
      super();
      this.dev = dev; this.svc = svc; this.uuid = uuid; this.value = null;
    }
    async startNotifications() {
      await Ble.startNotifications(this.dev.id, this.svc, this.uuid, (v) => {
        this.value = v;
        this.dispatchEvent(new Event('characteristicvaluechanged'));
      });
      return this;
    }
    async stopNotifications() {
      try { await Ble.stopNotifications(this.dev.id, this.svc, this.uuid); } catch (e) {}
      return this;
    }
    writeValueWithoutResponse(b) {
      return Ble.writeWithoutResponse(this.dev.id, this.svc, this.uuid, dv(b));
    }
    writeValueWithResponse(b) {
      return Ble.write(this.dev.id, this.svc, this.uuid, dv(b));
    }
    writeValue(b) { return this.writeValueWithResponse(b); }
  }

  class Svc {
    constructor(dev, uuid) { this.dev = dev; this.uuid = low(uuid); }
    async getCharacteristic(u) { return new Chr(this.dev, this.uuid, low(u)); }
  }

  class Dev extends EventTarget {
    constructor(id, name) {
      super();
      this.id = id; this.name = name || '';
      const self = this;
      this.gatt = {
        connected: false,
        device: self,
        async connect() {
          await Ble.connect(self.id, () => {
            self.gatt.connected = false;
            self.dispatchEvent(new Event('gattserverdisconnected'));
          });
          self.gatt.connected = true;
          return self.gatt;
        },
        disconnect() {
          self.gatt.connected = false;
          Ble.disconnect(self.id).catch(() => {});
        },
        async getPrimaryService(u) { return new Svc(self, u); },
      };
    }
  }

  const bt = {
    async requestDevice(opts) {
      const services = [];
      ((opts && opts.optionalServices) || []).forEach((s) => services.push(low(s)));
      await Ble.initialize({ androidNeverForLocation: true });
      // tanpa filter nama: tampilkan semua perangkat BLE, pilih yang namanya "GP ..."
      const d = await Ble.requestDevice({ optionalServices: services });
      return new Dev(d.deviceId, d.name);
    },
    async getAvailability() { return true; },
  };
  Object.defineProperty(target, 'bluetooth', { value: bt, configurable: true });
  return bt;
}

if (Capacitor.isNativePlatform()) installShim(BleClient, navigator);
