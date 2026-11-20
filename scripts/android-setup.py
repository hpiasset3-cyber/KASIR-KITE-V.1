"""Dijalankan workflow setelah `npx cap add android`: izin Bluetooth, plugin printer, dan MainActivity."""
import os

BASE = 'android/app/src/main'

# 1) Izin Bluetooth di AndroidManifest (perangkat di sekitar)
p = os.path.join(BASE, 'AndroidManifest.xml')
s = open(p, encoding='utf-8').read()
if 'xmlns:tools' not in s:
    s = s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
perms = """
    <!-- Bluetooth: cari, sambungkan, dan cetak ke perangkat di sekitar (printer) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
"""
assert 'BLUETOOTH_SCAN' not in s
open(p, 'w', encoding='utf-8').write(s.replace('</manifest>', perms + '</manifest>'))
print('AndroidManifest: izin Bluetooth ditambahkan')

# 2) Plugin printer Bluetooth klasik + pendaftarannya di MainActivity
main = None
for root, _, files in os.walk(os.path.join(BASE, 'java')):
    if 'MainActivity.java' in files:
        main = os.path.join(root, 'MainActivity.java')
assert main, 'MainActivity.java tidak ditemukan'
pkg = next(l.split()[1].rstrip(';') for l in open(main, encoding='utf-8') if l.startswith('package '))
plugin = open('native/BtPrinterPlugin.java', encoding='utf-8').read().replace('__APP_ID__', pkg)
open(os.path.join(os.path.dirname(main), 'BtPrinterPlugin.java'), 'w', encoding='utf-8').write(plugin)
open(main, 'w', encoding='utf-8').write(f"""package {pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(BtPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }}
}}
""")
print('Plugin BtPrinter terpasang di paket', pkg)
