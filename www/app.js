(() => {
    // ===== Helper & state =====
    const $ = s => document.querySelector(s);
    const $$ = s => [...document.querySelectorAll(s)];
    const rp = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(+n || 0);
    const now = () => new Date().toISOString();
    // Tanggal lokal (YYYY-MM-DD). toISOString() memakai UTC sehingga transaksi dini hari WIB tercatat di hari sebelumnya.
    const localDay = iso => {
        const d = new Date(iso), p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    };
    let products = JSON.parse(localStorage.getItem('kk_products') || 'null') || [{ id: 1, code: 'BRG-001', name: 'Air Mineral', cost: 3500, price: 5000, unit: 'Pcs', stock: 40 }];
    let txs = JSON.parse(localStorage.getItem('kk_txs') || '[]');
    let cart = [];
    let editId = null;
    let codeTouched = false; // true bila kode diketik manual, auto-isi dimatikan
    let filtered = [];
    const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = x => +String(x || '').replace(/\D/g, '') || 0;
    const msg = (id, t, ok = false) => {
        const e = $(id);
        e.textContent = t;
        e.className = 'notice ' + (ok ? 'ok' : '');
    };

    // ===== Penyimpanan (localStorage) =====
    function save() {
        localStorage.setItem('kk_products', JSON.stringify(products));
        localStorage.setItem('kk_txs', JSON.stringify(txs));
        localStorage.setItem('kk_updated', now());
    }

    function refreshStockFromStorage() {
        const saved = JSON.parse(localStorage.getItem('kk_products') || 'null');
        if (Array.isArray(saved)) {
            products = saved.map(p => ({ ...p, stock: Math.max(0, Number(p.stock) || 0) }));
            cart = cart.map(c => {
                const p = products.find(x => x.id === c.id);
                return p ? { ...c, name: p.name, price: p.price, cost: p.cost, unit: p.unit, qty: Math.min(c.qty, p.stock) } : null;
            }).filter(c => c && c.qty > 0);
        }
    }

    // ===== Kasir: produk & keranjang =====
    function renderProducts() {
        refreshStockFromStorage();
        let q = $('#search').value.toLowerCase();
        $('#products').innerHTML = products.filter(p => (p.name + p.code).toLowerCase().includes(q)).map(p => `<button class="product" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}><b>${esc(p.name)}</b><span class="price">${rp(p.price)}</span><span class="muted">${esc(p.code)} · ${p.stock} ${esc(p.unit)}</span></button>`).join('');
        $$('.product').forEach(b => b.onclick = () => {
            refreshStockFromStorage();
            let p = products.find(x => x.id == b.dataset.id);
            let c = cart.find(x => x.id === p.id);
            if (!p || p.stock < 1) {
                return msg('#cashMsg', 'Stok produk habis.');
            }
            if (c && c.qty < p.stock) {
                c.qty++;
            }
            else if (!c) {
                cart.push({ ...p, qty: 1 });
            }
            else {
                return msg('#cashMsg', 'Jumlah sudah mencapai stok tersedia: ' + p.stock + ' ' + p.unit + '.');
            }
            renderCart();
        });
    }

    function totals() {
        let sub = cart.reduce((s, x) => s + x.price * x.qty, 0);
        let disc = Math.min(sub, +$('#discount').value || 0);
        return { sub, disc, total: sub - disc };
    }

    function renderCart() {
        $('#cart').innerHTML = cart.length ? cart.map(c => `<div class="cart-item"><div><b>${esc(c.name)}</b><div class="muted">${rp(c.price)} × ${c.qty} ${esc(c.unit)}</div></div><div class="qty"><button class="btn" data-q="-1" data-id="${c.id}">−</button><input data-manual="${c.id}" type="number" min="1" value="${c.qty}"><button class="btn" data-q="1" data-id="${c.id}">+</button></div></div>`).join('') : '<p class="muted">Keranjang kosong.</p>';
        $$('[data-q]').forEach(b => b.onclick = () => {
            let c = cart.find(x => x.id == b.dataset.id);
            let p = products.find(x => x.id === c.id);
            c.qty = Math.max(0, Math.min(p.stock, c.qty + (+b.dataset.q)));
            if (!c.qty) {
                cart = cart.filter(x => x.id !== c.id);
            }
            renderCart();
        });
        $$('[data-manual]').forEach(i => i.onchange = () => {
            let c = cart.find(x => x.id == i.dataset.manual);
            let p = products.find(x => x.id === c.id);
            c.qty = Math.max(1, Math.min(p.stock, +i.value || 1));
            renderCart();
        });
        let t = totals();
        $('#subtotal').textContent = rp(t.sub);
        $('#total').textContent = rp(t.total);
        $('#change').textContent = rp(Math.max(0, num($('#pay').value) - t.total));
    }

    // ===== Kasir: transaksi & struk =====
    function cashierCode(name) {
        return String(name || 'KASIR').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'KASIR';
    }

    function nextTransactionId(cashier) {
        const prefix = cashierCode(cashier) + '-TRX-';
        let max = 0;
        txs.forEach(t => {
            if (String(t.id).startsWith(prefix)) {
                const n = Number(String(t.id).slice(prefix.length));
                if (Number.isFinite(n)) {
                    max = Math.max(max, n);
                }
            }
        });
        return prefix + String(max + 1).padStart(5, '0');
    }

    function checkout() {
        refreshStockFromStorage();
        let cashier = $('#cashier').value.trim();
        let t = totals();
        let pay = num($('#pay').value);
        if (!cashier) {
            return msg('#cashMsg', 'Nama kasir wajib diisi.');
        }
        if (!cart.length) {
            return msg('#cashMsg', 'Keranjang kosong.');
        }
        const invalid = cart.find(i => {
            const p = products.find(x => x.id === i.id);
            return !p || i.qty > p.stock;
        });
        if (invalid) {
            renderProducts();
            renderCart();
            return msg('#cashMsg', 'Stok ' + invalid.name + ' berubah. Jumlah keranjang sudah disesuaikan dengan stok terbaru.');
        }
        if (pay < t.total) {
            return msg('#cashMsg', 'Uang kurang ' + rp(t.total - pay));
        }
        let tx = { id: nextTransactionId(cashier), date: now(), cashier, items: cart.map(x => ({ ...x })), subtotal: t.sub, discount: t.disc, total: t.total, payment: pay, change: pay - t.total };
        txs.unshift(tx);
        tx.items.forEach(i => {
            const p = products.find(p => p.id === i.id);
            if (p) {
                p.stock -= i.qty;
            }
        });
        save();
        showReceipt(tx);
        resetNewTransaction();
        msg('#cashMsg', 'Transaksi berhasil disimpan. Keranjang dan pembayaran telah direset.', true);
    }

    function resetNewTransaction() {
        cart = [];
        $('#pay').value = '';
        $('#discount').value = 0;
        $('#search').value = '';
        $('#subtotal').textContent = rp(0);
        $('#total').textContent = rp(0);
        $('#change').textContent = rp(0);
        renderProducts();
        renderCart();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showReceipt(t) {
        $('#receipt').innerHTML = `${receiptHeaderHtml()}<hr class="dash"><div class="printrow"><span>${new Date(t.date).toLocaleString('id-ID')}</span><span>${esc(t.cashier)}</span></div><div>${esc(t.id)}</div><hr class="dash">${t.items.map((i, n) => `<b>${n + 1}. ${esc(i.name)}</b><div class="printrow"><span>${i.qty} ${esc(i.unit)} × ${rp(i.price)}</span><span>${rp(i.qty * i.price)}</span></div>`).join('')}<hr class="dash"><div>Total QTY: ${t.items.reduce((s, i) => s + i.qty, 0)}</div><hr class="dash"><div class="printrow"><span>Sub Total</span><b>${rp(t.subtotal)}</b></div><div class="printrow"><span>Total</span><b>${rp(t.total)}</b></div><div class="printrow"><span>Bayar</span><b>${rp(t.payment)}</b></div><div class="printrow"><span>Kembali</span><b>${rp(t.change)}</b></div><hr class="dash"><p style="text-align:center">Terimakasih Telah Berbelanja</p>`;
        requestAnimationFrame(() => {
            $('#modal').classList.add('show');
            $('#modal').setAttribute('aria-hidden', 'false');
        });
    }

    // Cetak ulang struk transaksi lama: struk dibuka di modal yang sama dengan setelah pembayaran, lalu tekan "Cetak Struk".
    function reprintReceipt(id) {
        const t = txs.find(x => x.id === id);
        if (!t) {
            return alert('Transaksi tidak ditemukan.');
        }
        showReceipt(t);
    }

    // ===== Laporan =====
    function report() {
        let f = $('#filter').value;
        let start = $('#dateStart').value;
        let end = $('#dateEnd').value;
        let month = $('#monthYear').value + '-' + $('#monthSelect').value;
        if (f === 'date' && start && end && start > end) {
            filtered = [];
            msg('#filterMsg', 'Tanggal mulai tidak boleh setelah tanggal akhir.');
        }
        else {
            msg('#filterMsg', '');
            filtered = txs.filter(t => {
                const day = localDay(t.date);
                if (f === 'all') {
                    return true;
                }
                if (f === 'month') {
                    return !month || day.slice(0, 7) === month;
                }
                return (!start || day >= start) && (!end || day <= end);
            });
        }
        ;
        let rev = filtered.reduce((s, t) => s + t.total, 0);
        let cost = filtered.reduce((s, t) => s + t.items.reduce((a, i) => a + (Number(i.cost) || 0) * i.qty, 0), 0);
        let items = filtered.reduce((s, t) => s + t.items.reduce((a, i) => a + i.qty, 0), 0);
        $('#metrics').innerHTML = [['Omzet', rp(rev)], ['Transaksi', filtered.length], ['Produk terjual', items], ['Rata-rata', rp(filtered.length ? rev / filtered.length : 0)], ['Total Modal', rp(cost)], ['Keuntungan', rp(rev - cost)], ['Margin', rev ? ((rev - cost) / rev * 100).toFixed(1) + '%' : '0%'], ['Status', !filtered.length ? 'Belum ada data' : rev - cost < 0 ? 'Rugi' : (rev - cost) / rev >= .25 ? 'Sehat' : 'Cukup']].map(x => `<div class="metric"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
        $('#report').innerHTML = filtered.length ? filtered.map(t => {
            let d = new Date(t.date);
            let c = t.items.reduce((s, i) => s + (Number(i.cost) || 0) * i.qty, 0);
            let date = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
            let time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(/\./g, ':');
            return `<tr><td>${esc(t.id)}</td><td>${date}</td><td>${time}</td><td>${esc(t.cashier)}</td><td>${rp(t.total)}</td><td>${rp(t.total - c)}</td><td><div class="reportActions"><button class="btn reportAction print" data-print-tx="${esc(t.id)}" type="button" title="Cetak ulang struk" aria-label="Cetak ulang struk">🖨</button><button class="btn reportAction edit" data-edit-tx="${esc(t.id)}" type="button" title="Edit transaksi" aria-label="Edit transaksi">✎</button><button class="btn reportAction delete" data-delete-tx="${esc(t.id)}" type="button" title="Hapus transaksi" aria-label="Hapus transaksi">🗑</button></div></td></tr>`;
        }).join('') : '<tr><td colspan="7" class="muted">Belum ada transaksi.</td></tr>';
        $$('[data-print-tx]').forEach(b => b.onclick = () => reprintReceipt(b.dataset.printTx));
        $$('[data-edit-tx]').forEach(b => b.onclick = () => openEditTransaction(b.dataset.editTx));
        $$('[data-delete-tx]').forEach(b => b.onclick = () => deleteTransaction(b.dataset.deleteTx));
    }
    let editingTxId = null;

    function openEditTransaction(id) {
        const t = txs.find(x => x.id === id);
        if (!t) {
            return;
        }
        editingTxId = id;
        const d = new Date(t.date);
        const pad = n => String(n).padStart(2, '0');
        $('#editTxId').value = t.id;
        $('#editTxDate').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        $('#editTxTime').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        $('#editTxCashier').value = t.cashier || '';
        $('#editTxDiscount').value = t.discount || 0;
        msg('#editTxMsg', '');
        $('#editTxModal').classList.add('show');
    }

    function saveTransactionEdit() {
        const t = txs.find(x => x.id === editingTxId);
        const cashier = $('#editTxCashier').value.trim();
        const date = $('#editTxDate').value;
        const time = $('#editTxTime').value;
        const discount = Math.max(0, +$('#editTxDiscount').value || 0);
        if (!t) {
            return;
        }
        if (!cashier || !date || !time) {
            return msg('#editTxMsg', 'Tanggal, waktu, dan nama kasir wajib diisi.');
        }
        if (discount > t.subtotal) {
            return msg('#editTxMsg', 'Diskon tidak boleh melebihi subtotal.');
        }
        const localDate = new Date(date + 'T' + time + ':00');
        if (Number.isNaN(localDate.getTime())) {
            return msg('#editTxMsg', 'Tanggal atau waktu tidak valid.');
        }
        t.date = localDate.toISOString();
        t.cashier = cashier;
        t.discount = discount;
        t.total = Math.max(0, t.subtotal - discount);
        t.change = Math.max(0, (t.payment || 0) - t.total);
        save();
        $('#editTxModal').classList.remove('show');
        editingTxId = null;
        report();
    }

    function deleteTransaction(id) {
        const t = txs.find(x => x.id === id);
        if (!t) {
            return;
        }
        if (!confirm('Hapus transaksi ' + id + '? Data transaksi akan dihapus permanen, tetapi stok produk tidak otomatis dikembalikan.')) {
            return;
        }
        txs = txs.filter(x => x.id !== id);
        save();
        report();
    }

    // Ekspor laporan ke XLSX: sheet Penjualan (per item) dan Ringkasan Produk.
    function exportXlsx() {
        if (typeof XLSX === 'undefined') {
            return alert('Modul XLSX belum termuat.');
        }
        report();
        if (!filtered.length) {
            return alert('Tidak ada transaksi untuk diekspor.');
        }
        const ACCOUNTING = '_("Rp"* #,##0_);_("Rp"* \\(#,##0\\);_("Rp"* "-"_);_(@_)';
        const thin = { style: 'thin', color: { rgb: '000000' } };
        const border = { top: thin, bottom: thin, left: thin, right: thin };
        const fill = rgb => ({ patternType: 'solid', fgColor: { rgb } });
        const headStyle = { font: { bold: true }, fill: fill('92D050'), alignment: { horizontal: 'center', vertical: 'center' }, border };
        const sumStyle = { font: { bold: true }, fill: fill('D9D9D9'), alignment: { horizontal: 'center', vertical: 'center' }, border };
        const align = { c: 'center', l: 'left' };

        // columns: [judul, lebar, jenis] dengan jenis c = tengah, l = kiri, m = uang (akuntansi).
        // sumFrom: indeks kolom pertama yang dijumlahkan; kolom sebelumnya digabung menjadi label JUMLAH.
        function buildSheet(columns, rows, sumFrom) {
            const n = rows.length, sumIdx = n + 1;
            const aoa = [columns.map(c => ({ v: c[0], t: 's', s: headStyle }))];
            rows.forEach(r => aoa.push(r.map((v, c) => columns[c][2] === 'm'
                ? { v, t: 'n', z: ACCOUNTING, s: { border, numFmt: ACCOUNTING } }
                : { v, t: typeof v === 'number' ? 'n' : 's', s: { border, alignment: { horizontal: align[columns[c][2]], vertical: 'center' } } })));
            aoa.push(columns.map((_, c) => {
                if (c < sumFrom) {
                    return { v: c === 0 ? 'JUMLAH' : '', t: 's', s: sumStyle };
                }
                const col = XLSX.utils.encode_col(c);
                return { v: rows.reduce((s, r) => s + r[c], 0), t: 'n', f: 'SUM(' + col + '2:' + col + (n + 1) + ')', z: ACCOUNTING, s: { font: { bold: true }, fill: fill('D9D9D9'), border, numFmt: ACCOUNTING } };
            }));
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = columns.map(c => ({ wch: c[1] }));
            ws['!merges'] = [{ s: { r: sumIdx, c: 0 }, e: { r: sumIdx, c: sumFrom - 1 } }];
            return ws;
        }

        // Satu baris per item. Diskon transaksi dibagi proporsional ke tiap item
        // agar jumlah Total sama dengan total di tab Laporan.
        const fmtDate = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const fmtTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        const lines = [];
        filtered.forEach(t => {
            const ratio = t.subtotal ? t.total / t.subtotal : 1;
            t.items.forEach(i => lines.push({ t, i, total: i.price * i.qty * ratio, modal: (Number(i.cost) || 0) * i.qty }));
        });

        // Sheet 1: Penjualan
        const salesRows = lines.map((l, n) => {
            const d = new Date(l.t.date);
            return [n + 1, l.t.id, fmtDate.format(d), fmtTime.format(d).replace(/\./g, ':'), l.t.cashier, l.i.name, l.i.qty, l.i.price, l.total, l.modal, l.total - l.modal];
        });

        // Sheet 2: Ringkasan Produk (Harga = rata-rata harga jual sebelum diskon)
        const byProduct = {};
        lines.forEach(l => {
            const p = byProduct[l.i.name] || (byProduct[l.i.name] = { qty: 0, gross: 0, total: 0, modal: 0 });
            p.qty += l.i.qty;
            p.gross += l.i.price * l.i.qty;
            p.total += l.total;
            p.modal += l.modal;
        });
        const productRows = Object.entries(byProduct)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([name, p], n) => [n + 1, name, p.qty, p.qty ? p.gross / p.qty : 0, p.total, p.modal, p.total - p.modal]);

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, buildSheet([['No', 5, 'c'], ['Transaksi', 18, 'l'], ['Tanggal', 12, 'c'], ['Waktu', 8, 'c'], ['Kasir', 14, 'l'], ['Produk', 26, 'l'], ['Qty', 6, 'c'], ['Harga', 14, 'm'], ['Total', 16, 'm'], ['Modal', 16, 'm'], ['Keuntungan', 16, 'm']], salesRows, 8), 'Penjualan');
        XLSX.utils.book_append_sheet(wb, buildSheet([['No', 5, 'c'], ['Produk', 26, 'l'], ['Qty', 6, 'c'], ['Harga', 14, 'm'], ['Total', 16, 'm'], ['Modal', 16, 'm'], ['Keuntungan', 16, 'm']], productRows, 4), 'Ringkasan Produk');
        if (isNative()) {
            shareNativeFile('laporan-kasir-kite.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }), 'Laporan Kasir Kite')
                .catch(e => {
                    if (!/cancel/i.test(String(e && e.message))) {
                        alert('Gagal menyimpan file: ' + (e && e.message));
                    }
                });
        }
        else {
            XLSX.writeFile(wb, 'laporan-kasir-kite.xlsx');
        }
    }

    // ===== Produk =====
    // Input uang berformat akuntansi (Rp 1.000): hanya angka yang diambil, tampilan diformat ulang saat mengetik.
    function moneyDigits(v) {
        return String(v).replace(/\D/g, '').slice(0, 12);
    }
    function moneyText(v) {
        const d = moneyDigits(v);
        return d ? rp(d) : '';
    }
    function moneyValue(el) {
        return +moneyDigits(el.value) || 0;
    }
    function bindMoneyInput(el) {
        el.oninput = () => {
            const digitsBeforeCaret = moneyDigits(el.value.slice(0, el.selectionStart)).length;
            el.value = moneyText(el.value);
            // Kursor dikembalikan ke posisi setelah jumlah digit yang sama (minimal setelah "Rp ").
            let pos = 0, seen = 0;
            while (pos < el.value.length && seen < digitsBeforeCaret) {
                if (/\d/.test(el.value[pos])) {
                    seen++;
                }
                pos++;
            }
            el.setSelectionRange(Math.max(pos, el.value ? 3 : 0), Math.max(pos, el.value ? 3 : 0));
        };
    }
    // Awalan kode dari nama: huruf pertama dua kata pertama (nama satu kata memakai 2 huruf pertama). Contoh: "Air Mineral" -> AM.
    function codePrefix(name) {
        const words = String(name).toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
        if (!words.length) {
            return 'BRG';
        }
        return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).padEnd(2, 'X');
    }
    // Kode berikutnya untuk awalan tersebut, nomor urut 4 digit. Contoh: AM-0001, AM-0002.
    function nextProductCode(name) {
        const prefix = codePrefix(name), re = new RegExp('^' + prefix + '-(\\d+)$');
        let max = 0;
        products.forEach(p => {
            const m = String(p.code).trim().toUpperCase().match(re);
            if (m) {
                max = Math.max(max, +m[1]);
            }
        });
        return prefix + '-' + String(max + 1).padStart(4, '0');
    }
    // Kode dianggap sama tanpa memandang huruf besar/kecil dan spasi. exceptId = produk yang sedang diedit.
    function isDuplicateCode(code, exceptId) {
        const key = String(code).trim().toUpperCase();
        return products.some(p => p.id !== exceptId && String(p.code).trim().toUpperCase() === key);
    }
    // Kosongkan form dan isi kode otomatis untuk produk baru.
    function prepareNewProduct() {
        editId = null;
        codeTouched = false;
        $('#productForm').reset();
        $('#pcode').value = nextProductCode('');
        $('#productSubmit').textContent = 'Tambah';
        msg('#productMsg', '');
    }
    function productTable() {
        $('#productTable').innerHTML = products.map(p => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${rp(p.cost)}</td><td>${rp(p.price)}</td><td>${esc(p.unit)}</td><td>${p.stock}</td><td><div class="actions"><button class="btn icon" data-edit="${p.id}">✎</button><button class="btn icon danger" data-del="${p.id}">🗑</button></div></td></tr>`).join('');
        $$('[data-edit]').forEach(b => b.onclick = () => {
            let p = products.find(x => x.id == b.dataset.edit);
            editId = p.id;
            ['code', 'name', 'unit', 'stock'].forEach(k => $('#p' + k).value = p[k]);
            $('#pcost').value = moneyText(p.cost);
            $('#pprice').value = moneyText(p.price);
            $('#productSubmit').textContent = 'Simpan';
        });
        $$('[data-del]').forEach(b => b.onclick = () => {
            if (confirm('Hapus produk?')) {
                products = products.filter(x => x.id != b.dataset.del);
                save();
                productTable();
                renderProducts();
            }
        });
    }

    // ===== Aplikasi Android (Capacitor) =====
    // WebView Android tidak mendukung unduhan blob, navigator.share, maupun window.open/print.
    // Di APK, file ditulis ke cache lalu dibuka lewat menu Bagikan; di browser biasa perilaku lama tetap dipakai.
    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }
    // Plugin native Capacitor tanpa bundler: lewat Capacitor.Plugins, cadangan registerPlugin.
    function nativePlugin(name) {
        const C = window.Capacitor;
        return (C.Plugins && C.Plugins[name]) || C.registerPlugin(name);
    }
    async function shareNativeFile(name, data, title, utf8) {
        const Filesystem = nativePlugin('Filesystem'), Share = nativePlugin('Share');
        const saved = await Filesystem.writeFile(Object.assign({ path: name, data, directory: 'CACHE' }, utf8 ? { encoding: 'utf8' } : {}));
        await Share.share({ title, dialogTitle: title, url: saved.uri });
    }

    // ===== Sinkronisasi data (kirim/terima file JSON) =====
    function bluetoothPackage() {
        return { app: 'Kasir Kite', version: 1, exported_at: now(), products, transactions: txs };
    }

    async function sendBluetooth() {
        try {
            const data = JSON.stringify(bluetoothPackage(), null, 2);
            const file = new File([data], 'kasir-kite-data-' + new Date().toISOString().slice(0, 10) + '.json', { type: 'application/json' });
            if (isNative()) {
                await shareNativeFile(file.name, data, 'Data Kasir Kite', true);
                msg('#btMsg', 'Paket data dibuka di menu berbagi. Pilih Bluetooth atau Quick Share.', true);
                return;
            }
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: 'Data Kasir Kite', text: 'Paket sinkronisasi Kasir Kite', files: [file] });
                msg('#btMsg', 'Paket data dibuka di menu berbagi. Pilih Bluetooth atau Quick Share.', true);
            }
            else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(file);
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(a.href);
                msg('#btMsg', 'Browser tidak mendukung berbagi file langsung. File JSON sudah diunduh; kirim file tersebut melalui Bluetooth.', true);
            }
        }
        catch (e) {
            if (e.name !== 'AbortError' && !/cancel/i.test(String(e.message))) {
                msg('#btMsg', 'Gagal menyiapkan data: ' + e.message);
            }
        }
    }

    function mergeBluetoothData(data) {
        if (!data || data.app !== 'Kasir Kite' || !Array.isArray(data.products) || !Array.isArray(data.transactions)) {
            throw Error('File bukan paket Kasir Kite yang valid.');
        }
        const backup = { products, transactions: txs, created_at: now() };
        localStorage.setItem('kk_backup_before_import', JSON.stringify(backup));
        const existingProductCodes = new Set(products.map(p => String(p.code).trim().toUpperCase()));
        let addedProducts = 0;
        let skippedProducts = 0;
        data.products.forEach(p => {
            const key = String(p.code || '').trim().toUpperCase();
            if (!key) {
                return;
            }
            if (existingProductCodes.has(key)) {
                skippedProducts++;
                return;
            }
            products.push({ ...p, id: Date.now() + addedProducts, code: key, name: String(p.name || key), unit: p.unit || 'Pcs', cost: Number(p.cost) || 0, price: Number(p.price) || 0, stock: Math.max(0, Number(p.stock) || 0) });
            existingProductCodes.add(key);
            addedProducts++;
        });
        const existingTxIds = new Set(txs.map(t => String(t.id)));
        let addedTx = 0;
        let skippedTx = 0;
        data.transactions.forEach(t => {
            if (!t || !t.id) {
                return;
            }
            const id = String(t.id);
            if (existingTxIds.has(id)) {
                skippedTx++;
                return;
            }
            txs.push(t);
            existingTxIds.add(id);
            addedTx++;
        });
        txs.sort((a, b) => new Date(b.date) - new Date(a.date));
        save();
        renderProducts();
        productTable();
        report();
        localStorage.setItem('kk_last_bt', now());
        return { addedProducts, skippedProducts, addedTx, skippedTx };
    }

    async function importBluetoothFile(file) {
        try {
            if (!file) {
                throw Error('Pilih file JSON dari HP pengirim.');
            }
            if (file.size > 10 * 1024 * 1024) {
                throw Error('Ukuran file melebihi batas 10 MB.');
            }
            const data = JSON.parse(await file.text());
            if (!data || data.app !== 'Kasir Kite' || !Array.isArray(data.products) || !Array.isArray(data.transactions)) {
                throw Error('File bukan paket Kasir Kite yang valid.');
            }
            const newP = data.products.filter(p => p && p.code && !products.some(x => String(x.code).toUpperCase() === String(p.code).toUpperCase())).length;
            const newT = data.transactions.filter(t => t && t.id && !txs.some(x => String(x.id) === String(t.id))).length;
            if (!confirm('Impor akan MENAMBAHKAN ' + newP + ' produk dan ' + newT + ' transaksi. Data lama tidak akan dihapus atau ditimpa. Lanjutkan?')) {
                return;
            }
            const r = mergeBluetoothData(data);
            msg('#btMsg', 'Impor aman berhasil. Ditambah: ' + r.addedProducts + ' produk dan ' + r.addedTx + ' transaksi. Dipertahankan: ' + r.skippedProducts + ' produk dan ' + r.skippedTx + ' transaksi lama/duplikat.', true);
        }
        catch (e) {
            msg('#btMsg', 'Impor gagal: ' + e.message);
        }
    }
    $('#btSend').onclick = sendBluetooth;
    $('#btImport').onclick = () => $('#btFile').click();
    $('#btFile').onchange = e => {
        importBluetoothFile(e.target.files[0]);
        e.target.value = '';
    };

    // ===== Jam & navigasi tab =====
    function updateClock() {
        const d = new Date();
        $('#liveDate').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d);
        $('#liveTime').textContent = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(/\./g, ':');
    }
    updateClock();
    setInterval(updateClock, 1000);
    $$('.tab').forEach(b => b.onclick = () => {
        $$('.tab').forEach(x => x.classList.toggle('active', x === b));
        $$('.panel').forEach(x => x.classList.toggle('active', x.id === b.dataset.p));
        if (b.dataset.p === 'laporan') {
            report();
        }
        if (b.dataset.p === 'produk') {
            productTable();
        }
    });
    window.addEventListener('storage', e => {
        if (e.key === 'kk_products') {
            refreshStockFromStorage();
            renderProducts();
            renderCart();
            productTable();
        }
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshStockFromStorage();
            renderProducts();
            renderCart();
        }
    });
    $('#search').oninput = renderProducts;
    $('#discount').oninput = renderCart;
    $('#pay').oninput = e => {
        e.target.value = num(e.target.value).toLocaleString('id-ID');
        renderCart();
    };
    $('#clear').onclick = () => {
        cart = [];
        renderCart();
    };
    $('#checkout').onclick = checkout;
    $('#apply').onclick = report;
    $('#filter').onchange = updateFilterFields;

    function updateFilterFields() {
        const mode = $('#filter').value;
        $('#dateRangeFields').hidden = mode !== 'date';
        $('#monthField').hidden = mode !== 'month';
        msg('#filterMsg', '');
    }
    $('#dateStart').onchange = () => {
        if ($('#dateEnd').value && $('#dateStart').value > $('#dateEnd').value) {
            msg('#filterMsg', 'Tanggal mulai tidak boleh setelah tanggal akhir.');
        }
        else {
            msg('#filterMsg', '');
        }
    };
    $('#dateEnd').onchange = () => {
        if ($('#dateStart').value && $('#dateStart').value > $('#dateEnd').value) {
            msg('#filterMsg', 'Tanggal mulai tidak boleh setelah tanggal akhir.');
        }
        else {
            msg('#filterMsg', '');
        }
    };
    $('#productForm').onsubmit = e => {
        e.preventDefault();
        if (!editId && !codeTouched) {
            $('#pcode').value = nextProductCode($('#pname').value);
        }
        let p = { id: editId || Date.now(), code: $('#pcode').value.trim().toUpperCase(), name: $('#pname').value.trim(), cost: moneyValue($('#pcost')), price: moneyValue($('#pprice')), unit: $('#punit').value, stock: +$('#pstock').value };
        if (isDuplicateCode(p.code, editId)) {
            return msg('#productMsg', 'Kode ' + p.code + ' sudah dipakai produk lain. Gunakan kode yang berbeda.');
        }
        if (p.price < 1) {
            return msg('#productMsg', 'Harga jual minimal Rp 1.');
        }
        if (p.cost > p.price) {
            return msg('#productMsg', 'Modal tidak boleh melebihi harga jual.');
        }
        if (editId) {
            products[products.findIndex(x => x.id === editId)] = p;
        }
        else {
            products.push(p);
        }
        prepareNewProduct();
        save();
        productTable();
        renderProducts();
    };
    // Kode terisi otomatis dari nama selama belum diubah manual; peringatan langsung bila kode sudah dipakai.
    $('#pname').oninput = () => {
        if (!editId && !codeTouched) {
            $('#pcode').value = nextProductCode($('#pname').value);
        }
    };
    $('#pcode').oninput = e => {
        const code = e.target.value.trim();
        codeTouched = code !== '';
        msg('#productMsg', code && isDuplicateCode(code, editId) ? 'Kode ' + code.toUpperCase() + ' sudah dipakai produk lain.' : '');
    };
    bindMoneyInput($('#pcost'));
    bindMoneyInput($('#pprice'));
    $('#xlsx').onclick = exportXlsx;
    $('#theme').onclick = () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('kk_dark', document.body.classList.contains('dark'));
    };
    $('#cancelEditTx').onclick = () => {
        $('#editTxModal').classList.remove('show');
        editingTxId = null;
    };
    $('#saveEditTx').onclick = saveTransactionEdit;
    $('#close').onclick = () => {
        $('#modal').classList.remove('show');
        $('#modal').setAttribute('aria-hidden', 'true');
    };
    let selectedPrinter = null;
    $('#pairPrinter').onclick = async () => {
        try {
            if (isNative()) {
                return await pairNativePrinter();
            }
            if (!navigator.bluetooth) {
                throw Error('Browser tidak mendukung pemilih Bluetooth. Pasangkan printer dari Pengaturan Bluetooth HP.');
            }
            $('#printerStatus').textContent = 'Mencari printer Bluetooth…';
            const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
            selectedPrinter = device;
            $('#printerStatus').textContent = 'Dipilih: ' + (device.name || 'Perangkat Bluetooth');
            $('#printerDot').classList.add('connected');
        }
        catch (e) {
            if (e.name !== 'NotFoundError') {
                $('#printerStatus').textContent = e.message;
            }
            else {
                $('#printerStatus').textContent = 'Pemilihan printer dibatalkan.';
            }
        }
    };
    // ===== Kop struk: logo sederhana + nama usaha =====
    // Digambar ke canvas lalu dipakai di layar, cetak browser, dan dikirim sebagai bitmap ke printer thermal.
    const STORE_NAME = 'BAKSO BAKAR MEDAN';
    const FEED_TOP = 3;     // baris kosong sebelum struk (agar tidak mepet tepi atas)
    const FEED_BOTTOM = 5;  // baris kosong setelah struk (agar mudah disobek)

    function receiptHeaderCanvas() {
        const W = 384, H = 172, c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#000';
        g.strokeStyle = '#000';
        const cx = W / 2;
        const FONT = '"Arial Black", "Roboto Black", Impact, sans-serif';
        // Logo: tiga bakso di tusuk, di atas panggangan dengan nyala api di bawahnya
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx - 70, 24);
        g.lineTo(cx + 66, 24);
        g.stroke();
        g.beginPath();
        g.moveTo(cx + 64, 17);
        g.lineTo(cx + 82, 24);
        g.lineTo(cx + 64, 31);
        g.closePath();
        g.fill();
        g.beginPath();
        g.arc(cx - 72, 24, 5, 0, Math.PI * 2);
        g.fill();
        [-34, 0, 34].forEach(dx => {
            g.beginPath();
            g.arc(cx + dx, 24, 15, 0, Math.PI * 2);
            g.fill();
            g.beginPath();
            g.arc(cx + dx - 4, 19, 7, Math.PI, Math.PI * 1.55);
            g.lineWidth = 2.5;
            g.strokeStyle = '#fff';
            g.stroke();
        });
        g.fillStyle = '#000';
        g.fillRect(cx - 74, 46, 148, 5);
        [[-52, 14], [-26, 22], [0, 28], [26, 22], [52, 14]].forEach(([dx, h]) => {
            const x = cx + dx, base = 78;
            g.beginPath();
            g.moveTo(x - 11, base);
            g.quadraticCurveTo(x - 13, base - h * 0.55, x, base - h);
            g.quadraticCurveTo(x + 13, base - h * 0.55, x + 11, base);
            g.closePath();
            g.fill();
        });
        // Nama usaha: tebal, dua baris. Ukuran huruf mengecil otomatis bila terlalu lebar.
        const fit = (txt, size, maxW) => {
            do {
                g.font = '900 ' + size + 'px ' + FONT;
                size -= 2;
            } while (g.measureText(txt).width > maxW && size > 12);
        };
        g.textAlign = 'center';
        g.fillStyle = '#000';
        const words = STORE_NAME.split(' ');
        const last = words.pop(), first = words.join(' ');
        fit(first, 48, W - 16);
        g.fillText(first, cx, 128);
        fit(last, 32, W - 140);
        if ('letterSpacing' in g) {
            g.letterSpacing = '5px';
        }
        g.fillText(last, cx + 2, 162);
        const half = g.measureText(last).width / 2, x2 = cx + half + 12, w1 = cx - half - 26;
        g.fillRect(14, 148, w1, 3);
        g.fillRect(14, 154, w1, 2);
        g.fillRect(x2, 148, W - 14 - x2, 3);
        g.fillRect(x2, 154, W - 14 - x2, 2);
        return c;
    }

    function receiptHeaderHtml() {
        try {
            return '<div class="rcpHead"><img src="' + receiptHeaderCanvas().toDataURL('image/png') + '" alt="' + STORE_NAME + '"></div>';
        }
        catch (e) {
            return '<h3 class="rcpHead">' + STORE_NAME + '</h3>';
        }
    }

    // Canvas -> perintah raster ESC/POS (GS v 0), 1 bit per piksel: hitam bila cukup gelap.
    function rasterBytes(canvas) {
        const w = canvas.width, h = canvas.height, bw = Math.ceil(w / 8);
        const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        const out = [0x1D, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8];
        for (let y = 0; y < h; y++) {
            for (let bx = 0; bx < bw; bx++) {
                let byte = 0;
                for (let k = 0; k < 8; k++) {
                    const x = bx * 8 + k, i = (y * w + x) * 4;
                    if (x < w && px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11 < 128) {
                        byte |= 0x80 >> k;
                    }
                }
                out.push(byte);
            }
        }
        return out;
    }

    // ===== Cetak langsung ke printer thermal (APK) =====
    function bytesToBase64(bytes) {
        let s = '';
        bytes.forEach(b => {
            s += String.fromCharCode(b);
        });
        return btoa(s);
    }

    // Ubah isi struk (#receipt) menjadi perintah ESC/POS. Lebar 32 kolom untuk kertas 57/58 mm.
    function buildEscPos(receipt, cols = 32, withImage = true) {
        const out = [0x1B, 0x40, 0x1B, 0x64, FEED_TOP];
        const clean = s => String(s).replace(/\u00A0/g, ' ').replace(/\u00D7/g, 'x').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?').replace(/\s+/g, ' ').trim();
        const line = s => {
            for (const ch of s) {
                out.push(ch.charCodeAt(0));
            }
            out.push(0x0A);
        };
        const wrap = (s, width = cols) => {
            const rows = [];
            let cur = '';
            clean(s).split(' ').forEach(w => {
                while (w.length > width) {
                    if (cur) {
                        rows.push(cur);
                        cur = '';
                    }
                    rows.push(w.slice(0, width));
                    w = w.slice(width);
                }
                if (cur && (cur + ' ' + w).length > width) {
                    rows.push(cur);
                    cur = w;
                }
                else {
                    cur = cur ? cur + ' ' + w : w;
                }
            });
            if (cur) {
                rows.push(cur);
            }
            return rows;
        };
        const align = n => out.push(0x1B, 0x61, n);
        const bold = n => out.push(0x1B, 0x45, n);
        Array.from(receipt.children).forEach(el => {
            if (el.classList.contains('rcpHead')) {
                if (withImage && el.querySelector('img')) {
                    rasterBytes(receiptHeaderCanvas()).forEach(b => out.push(b));
                }
                else {
                    out.push(0x1B, 0x61, 1, 0x1B, 0x45, 1, 0x1D, 0x21, 0x11);
                    wrap(STORE_NAME, Math.floor(cols / 2)).forEach(line);
                    out.push(0x1D, 0x21, 0x00, 0x1B, 0x45, 0, 0x1B, 0x61, 0);
                }
            }
            else if (el.tagName === 'H3') {
                align(1);
                bold(1);
                wrap(el.textContent).forEach(line);
                bold(0);
                align(0);
            }
            else if (el.tagName === 'HR') {
                line('-'.repeat(cols));
            }
            else if (el.classList.contains('printrow') && el.children.length > 1) {
                const l = clean(el.children[0].textContent), r = clean(el.children[1].textContent);
                if (l.length + r.length < cols) {
                    line(l + ' '.repeat(cols - l.length - r.length) + r);
                }
                else {
                    wrap(l).forEach(line);
                    line(' '.repeat(Math.max(0, cols - r.length)) + r);
                }
            }
            else if (el.tagName === 'P' && /center/.test(el.getAttribute('style') || '')) {
                align(1);
                wrap(el.textContent).forEach(line);
                align(0);
            }
            else {
                wrap(el.textContent).forEach(line);
            }
        });
        out.push(0x1B, 0x64, FEED_BOTTOM);
        return out;
    }

    // Cetak lewat BLE: pakai characteristic yang bisa ditulis, data dikirim per 20 byte.
    async function printBle(deviceId, bytes) {
        const BLE = nativePlugin('BluetoothLe');
        let services = [];
        try {
            services = (await BLE.getServices({ deviceId })).services || [];
        }
        catch (e) {
            services = [];
        }
        if (!services.length) {
            await BLE.connect({ deviceId, timeout: 15000 });
            services = (await BLE.getServices({ deviceId })).services || [];
        }
        const cands = [];
        services.forEach(s => {
            if (/^0000180[01]-/i.test(s.uuid)) {
                return;
            }
            (s.characteristics || []).forEach(c => {
                const p = c.properties || {};
                if (p.write || p.writeWithoutResponse) {
                    cands.push({ service: s.uuid, characteristic: c.uuid, noResp: !p.write });
                }
            });
        });
        const t = cands.find(c => /^(0000ff00|000018f0|49535343|e7810a71)/i.test(c.service)) || cands[0];
        if (!t) {
            throw Error('Printer ini tidak punya jalur tulis BLE. Coba pilih dari daftar printer yang sudah dipasangkan.');
        }
        for (let i = 0; i < bytes.length; i += 20) {
            const value = bytes.slice(i, i + 20).map(b => b.toString(16).padStart(2, '0')).join('');
            await BLE[t.noResp ? 'writeWithoutResponse' : 'write']({ deviceId, service: t.service, characteristic: t.characteristic, value });
            await new Promise(r => setTimeout(r, 25));
        }
    }

    function savedPrinter() {
        try {
            return JSON.parse(localStorage.getItem('kk_printer') || 'null');
        }
        catch (e) {
            return null;
        }
    }

    // APK edge-to-edge: tinggi status bar / navigation bar dibaca dari native, dipakai sebagai --sat dan --sab di CSS.
    async function applySafeArea() {
        try {
            const i = await nativePlugin('BtPrinter').insets();
            document.documentElement.style.setProperty('--sat', i.top + 'px');
            document.documentElement.style.setProperty('--sab', i.bottom + 'px');
        }
        catch (e) {
            // APK lama tanpa fungsi ini: abaikan
        }
    }
    function initSafeArea() {
        if (!isNative()) {
            return;
        }
        applySafeArea();
        [300, 1000, 2500].forEach(ms => setTimeout(applySafeArea, ms));
        window.addEventListener('resize', applySafeArea);
    }

    // Tampilkan printer yang dipilih sebelumnya saat aplikasi dibuka.
    function restoreNativePrinter() {
        const p = isNative() && savedPrinter();
        if (p) {
            $('#printerStatus').textContent = 'Printer: ' + p.name + ' (siap dipakai)';
            $('#printerDot').classList.add('connected');
        }
    }

    async function printNative(receipt) {
        const printer = savedPrinter(), status = $('#printerStatus');
        if (!printer) {
            status.textContent = 'Printer belum dipilih. Ketuk "Hubungkan Printer".';
            return;
        }
        try {
            status.textContent = 'Mencetak ke ' + printer.name + '…';
            const bytes = buildEscPos(receipt, 32, printer.type !== 'ble');
            if (printer.type === 'ble') {
                await printBle(printer.deviceId, bytes);
            }
            else {
                await nativePlugin('BtPrinter').print({ address: printer.address, data: bytesToBase64(bytes) });
            }
            status.textContent = 'Struk terkirim ke ' + printer.name + '.';
        }
        catch (e) {
            status.textContent = 'Gagal mencetak: ' + String((e && e.message) || e);
        }
    }

    // Daftar pilihan printer: yang sudah dipasangkan di pengaturan Bluetooth HP (klasik) atau cari BLE.
    function chooseDevice(paired, note) {
        return new Promise(resolve => {
            const m = document.createElement('div');
            m.className = 'modal show';
            const items = paired.length
                ? paired.map((d, i) => '<button class="btn" type="button" data-i="' + i + '">' + esc(d.name) + '<br><small>' + esc(d.address) + '</small></button>').join('')
                : '<p class="muted">Belum ada printer yang dipasangkan. Pasangkan dulu di Pengaturan Bluetooth HP.</p>';
            m.innerHTML = '<div class="modalbox"><h3>Pilih printer</h3>' + (note ? '<p class="notice">' + esc(note) + '</p>' : '')
                + '<p class="muted">Printer yang sudah dipasangkan:</p><div style="display:grid;gap:8px">' + items
                + '<button class="btn" type="button" data-ble="1">Cari perangkat Bluetooth LE…</button>'
                + '<button class="btn" type="button" data-cancel="1">Batal</button></div></div>';
            m.onclick = e => {
                const b = e.target.closest('button');
                if (!b) {
                    return;
                }
                m.remove();
                const d = b.dataset.i !== undefined ? paired[+b.dataset.i] : null;
                resolve(d ? { type: 'spp', address: d.address, name: d.name } : b.dataset.ble ? { type: 'ble' } : null);
            };
            document.body.appendChild(m);
        });
    }

    async function pairNativePrinter() {
        const status = $('#printerStatus'), dot = $('#printerDot');
        let paired = [], note = '';
        try {
            status.textContent = 'Membaca printer yang sudah dipasangkan…';
            paired = (await nativePlugin('BtPrinter').list()).devices || [];
        }
        catch (e) {
            note = String((e && e.message) || e);
        }
        const choice = await chooseDevice(paired, note);
        if (!choice) {
            status.textContent = 'Pemilihan printer dibatalkan.';
            return;
        }
        if (choice.type === 'ble') {
            return pairBlePrinter();
        }
        try {
            status.textContent = 'Menyambungkan ke ' + choice.name + '…';
            await nativePlugin('BtPrinter').print({ address: choice.address, data: bytesToBase64([0x1B, 0x40]) });
            selectedPrinter = choice;
            localStorage.setItem('kk_printer', JSON.stringify(choice));
            dot.classList.add('connected');
            status.textContent = 'Tersambung: ' + choice.name;
        }
        catch (e) {
            dot.classList.remove('connected');
            status.textContent = String((e && e.message) || e);
        }
    }

    // APK: cari dan sambungkan perangkat Bluetooth LE sekitar lewat plugin BluetoothLe.
    // initialize() meminta izin "Perangkat di sekitar" (Android 12+) atau Lokasi (Android 11 ke bawah).
    async function pairBlePrinter() {
        const BLE = nativePlugin('BluetoothLe'), status = $('#printerStatus'), dot = $('#printerDot');
        try {
            status.textContent = 'Meminta izin Bluetooth…';
            await BLE.initialize({ androidNeverForLocation: true });
            if (!(await BLE.isEnabled()).value) {
                await BLE.requestEnable();
            }
            status.textContent = 'Mencari perangkat sekitar…';
            const device = await BLE.requestDevice({});
            const label = device.name || device.deviceId;
            status.textContent = 'Menyambungkan ke ' + label + '…';
            await BLE.connect({ deviceId: device.deviceId, timeout: 15000 });
            selectedPrinter = device;
            localStorage.setItem('kk_printer', JSON.stringify({ type: 'ble', deviceId: device.deviceId, name: label }));
            dot.classList.add('connected');
            status.textContent = 'Tersambung: ' + label;
            BLE.addListener('disconnected|' + device.deviceId, () => {
                dot.classList.remove('connected');
                status.textContent = 'Terputus dari ' + label + '. Ketuk untuk menyambung lagi.';
            });
        }
        catch (e) {
            const m = String((e && e.message) || e);
            dot.classList.remove('connected');
            if (/cancel/i.test(m)) {
                status.textContent = 'Pemilihan printer dibatalkan.';
            }
            else if (/no device/i.test(m)) {
                status.textContent = 'Tidak ada perangkat ditemukan. Pastikan printer menyala dan Bluetooth-nya aktif.';
            }
            else if (/permission|denied/i.test(m)) {
                status.textContent = 'Izin ditolak. Buka Pengaturan > Aplikasi > Kasir Kite > Izin, lalu aktifkan "Perangkat di sekitar".';
            }
            else if (/location/i.test(m)) {
                status.textContent = 'Aktifkan Lokasi di HP agar Bluetooth bisa mencari perangkat (Android 11 ke bawah).';
            }
            else {
                status.textContent = 'Gagal: ' + m;
            }
        }
    }
    $('#print').onclick = printThermalReceipt;

    function printThermalReceipt() {
        const receipt = $('#receipt');
        if (!receipt || !receipt.innerHTML.trim()) {
            return msg('#cashMsg', 'Struk belum tersedia.');
        }
        if (isNative()) {
            // Tidak ada window.print di WebView: kirim perintah ESC/POS langsung ke printer Bluetooth.
            printNative(receipt);
            return;
        }
        const w = window.open('', '_blank', 'width=360,height=640');
        if (!w) {
            $('#printerStatus').textContent = 'Pop-up diblokir. Izinkan pop-up untuk mencetak.';
            return;
        }
        w.document.open();
        w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cetak Struk</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:57mm;background:#fff;color:#000}body{font-family:Arial,sans-serif}.paper{width:57mm;padding:3mm;background:#fff;color:#000;font:8px Arial}.rcpHead img{width:100%;display:block}.paper h3{text-align:center;margin:0}.dash{border:0;border-top:1px dashed #000}.printrow{display:flex;justify-content:space-between;gap:2mm}.printrow span:last-child,.printrow b:last-child{text-align:right;white-space:nowrap}@page{size:57mm auto;margin:0}@media print{html,body,.paper{width:57mm}.paper{page-break-after:avoid;break-after:avoid}}</style></head><body>${receipt.outerHTML}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));window.addEventListener('afterprint',()=>window.close());<\/script></body></html>`);
        w.document.close();
    }
    $('#cashier').value = localStorage.getItem('kk_cashier') || '';
    $('#cashier').oninput = e => localStorage.setItem('kk_cashier', e.target.value);
    if (localStorage.getItem('kk_dark') === 'true') {
        document.body.classList.add('dark');
    }
    const today = localDay(now());
    $('#dateStart').value = today;
    $('#dateEnd').value = today;
    $('#monthSelect').value = today.slice(5, 7);
    $('#monthYear').value = today.slice(0, 4);
    updateFilterFields();
    renderProducts();
    renderCart();
    productTable();
    prepareNewProduct();
    initSafeArea();
    restoreNativePrinter();
    report();
})();


// Agar bisa dipasang & jalan offline (hanya aktif bila dibuka lewat http/https, bukan file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
