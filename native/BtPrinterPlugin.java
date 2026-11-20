package __APP_ID__;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Cetak ke printer thermal Bluetooth klasik (SPP) yang sudah dipasangkan di Pengaturan Bluetooth HP.
 * Dipakai dari JavaScript sebagai plugin "BtPrinter": list() dan print({ address, data(base64) }).
 */
@SuppressLint("MissingPermission")
@CapacitorPlugin(
    name = "BtPrinter",
    permissions = { @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "btConnect") }
)
public class BtPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    // BLUETOOTH_CONNECT hanya ada di Android 12 (API 31) ke atas.
    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("btConnect") != PermissionState.GRANTED;
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("btConnect", call, "listAfterPermission");
            return;
        }
        doList(call);
    }

    @PermissionCallback
    private void listAfterPermission(PluginCall call) {
        if (needsPermission()) {
            call.reject("Izin Bluetooth ditolak. Aktifkan izin \"Perangkat di sekitar\" untuk aplikasi ini.");
            return;
        }
        doList(call);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias("btConnect", call, "printAfterPermission");
            return;
        }
        doPrint(call);
    }

    @PermissionCallback
    private void printAfterPermission(PluginCall call) {
        if (needsPermission()) {
            call.reject("Izin Bluetooth ditolak. Aktifkan izin \"Perangkat di sekitar\" untuk aplikasi ini.");
            return;
        }
        doPrint(call);
    }

    private void doList(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Perangkat ini tidak mendukung Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.");
            return;
        }
        JSArray devices = new JSArray();
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded != null) {
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName() != null ? d.getName() : d.getAddress());
                o.put("address", d.getAddress());
                devices.put(o);
            }
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    private void doPrint(PluginCall call) {
        final String address = call.getString("address");
        final String data = call.getString("data");
        if (address == null || data == null) {
            call.reject("Alamat printer dan data wajib diisi.");
            return;
        }
        new Thread(() -> {
            BluetoothSocket socket = null;
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    throw new IllegalStateException("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.");
                }
                adapter.cancelDiscovery();
                BluetoothDevice device = adapter.getRemoteDevice(address);
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP);
                    socket.connect();
                } catch (Exception first) {
                    // Cadangan untuk printer yang menolak UUID standar.
                    if (socket != null) {
                        try {
                            socket.close();
                        } catch (Exception ignored) {
                        }
                    }
                    socket = (BluetoothSocket) device.getClass().getMethod("createRfcommSocket", int.class).invoke(device, 1);
                    socket.connect();
                }
                OutputStream out = socket.getOutputStream();
                int offset = 0;
                while (offset < bytes.length) {
                    int n = Math.min(512, bytes.length - offset);
                    out.write(bytes, offset, n);
                    offset += n;
                    Thread.sleep(20);
                }
                out.flush();
                // Beri waktu printer menerima semua data sebelum koneksi ditutup.
                Thread.sleep(Math.min(4000, 700 + bytes.length / 5));
                call.resolve();
            } catch (Exception e) {
                String m = e.getMessage();
                call.reject("Gagal mencetak: " + (m != null ? m : e.toString()) + ". Pastikan printer menyala dan sudah dipasangkan di Pengaturan Bluetooth HP.");
            } finally {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Exception ignored) {
                    }
                }
            }
        }).start();
    }
}
