import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import Decimal from 'decimal.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import './App.css'
import {
  isLocalAppData,
  loadLocalData,
  saveLocalData,
  type LocalAppData,
  type Product,
  type StockMovement,
} from './localDatabase'

type ViewKey = 'dashboard' | 'sales' | 'inventory' | 'reports' | 'settings'
type IconName = ViewKey | 'alert' | 'arrow' | 'box' | 'check' | 'clock' | 'money' | 'plus' | 'scale' | 'spark' | 'trend'

const navigation: Array<{ key: ViewKey; label: string; icon: IconName }> = [
  { key: 'dashboard', label: '總覽', icon: 'dashboard' },
  { key: 'sales', label: '銷售', icon: 'sales' },
  { key: 'inventory', label: '庫存', icon: 'inventory' },
  { key: 'reports', label: '報表', icon: 'reports' },
  { key: 'settings', label: '設定', icon: 'settings' },
]

const decimal = (value: Decimal.Value) => new Decimal(value || 0)
const money = (value: Decimal.Value) => `NT$ ${decimal(value).toDecimalPlaces(0).toNumber().toLocaleString('zh-TW')}`
const quantity = (value: Decimal.Value) => decimal(value).toDecimalPlaces(3).toString()
const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const localDateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(value))

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    sales: <><path d="M4 5h16l-1.3 8.2a3 3 0 0 1-3 2.5H8.3a3 3 0 0 1-3-2.5L4 5Z" /><path d="M8 20h.01M16 20h.01M8 9h8" /></>,
    inventory: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /><path d="M12 11v10" /></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 15.4 21 17l-4 4-1.6-2A8 8 0 0 1 13 20v2H9v-2a8 8 0 0 1-2.4-1L5 21l-3-4 2-1.6A8 8 0 0 1 3 13H1V9h2a8 8 0 0 1 1-2.4L2 5l3-3 1.6 2A8 8 0 0 1 9 3V1h4v2a8 8 0 0 1 2.4 1L17 2l4 3-2 1.6A8 8 0 0 1 20 9h2v4h-2a8 8 0 0 1-1 2.4Z" /></>,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    box: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M8 12h8M12 9v6" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7ZM19 7l-3 6h6l-3-6Z" /></>,
    spark: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" />,
    trend: <path d="m4 16 5-5 4 3 7-8M15 6h5v5" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span className="brand-mark__eye" /><span className="brand-mark__bill" /></div>
}

function MetricCard({ label, value, hint, icon, accent }: { label: string; value: string; hint: string; icon: IconName; accent: 'orange' | 'green' | 'red' | 'gold' }) {
  return <article className={`metric-card metric-card--${accent}`}><div className="metric-card__head"><span>{label}</span><span className="metric-card__icon"><Icon name={icon} size={20} /></span></div><strong>{value}</strong><small>{hint}</small></article>
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span><Icon name="box" size={28} /></span><strong>{title}</strong><p>{children}</p></div>
}

function Dashboard({ data, navigate, openMovement }: { data: LocalAppData; navigate: (view: ViewKey) => void; openMovement: (type: 'purchase' | 'adjustment', product?: Product) => void }) {
  const today = localDateKey(new Date().toISOString())
  const todaySales = data.movements.filter((item) => item.type === 'sale' && localDateKey(item.createdAt) === today)
  const revenue = todaySales.reduce((sum, item) => sum.plus(item.revenue), decimal(0))
  const profit = todaySales.reduce((sum, item) => sum.plus(decimal(item.revenue).minus(item.costTotal)), decimal(0))
  const lowStock = data.products.filter((item) => decimal(item.stock).lte(item.reorderLevel))
  const inventoryValue = data.products.reduce((sum, item) => sum.plus(decimal(item.stock).times(item.cost)), decimal(0))

  return <>
    <section className="preview-note preview-note--local" aria-label="資料儲存狀態"><span className="preview-note__icon"><Icon name="check" size={18} /></span><div><strong>本機離線版</strong><span>資料只儲存在這台裝置，不會傳送到 Supabase 或其他雲端。</span></div></section>
    <section className="metrics" aria-label="今日營運摘要">
      <MetricCard label="今日銷售" value={money(revenue)} hint={`${todaySales.length} 筆銷售紀錄`} icon="money" accent="orange" />
      <MetricCard label="今日毛利" value={money(profit)} hint={revenue.gt(0) ? `毛利率 ${profit.div(revenue).times(100).toFixed(1)}%` : '尚無銷售'} icon="trend" accent="green" />
      <MetricCard label="待補貨" value={`${lowStock.length} 項`} hint={lowStock.length ? '庫存低於安全值' : '目前庫存充足'} icon="alert" accent="red" />
      <MetricCard label="庫存價值" value={money(inventoryValue)} hint={`共 ${data.products.length} 項商品`} icon="box" accent="gold" />
    </section>
    <section className="quick-actions" aria-labelledby="quick-actions-title"><div className="section-heading"><div><p className="eyebrow">常用功能</p><h2 id="quick-actions-title">快速操作</h2></div></div><div className="quick-actions__grid">
      <button type="button" onClick={() => navigate('sales')}><span className="quick-actions__icon quick-actions__icon--sale"><Icon name="plus" /></span><span><strong>新增銷售</strong><small>登記售出數量與收入</small></span><Icon name="arrow" size={18} /></button>
      <button type="button" onClick={() => openMovement('purchase')}><span className="quick-actions__icon quick-actions__icon--purchase"><Icon name="inventory" /></span><span><strong>進貨入庫</strong><small>更新數量與平均成本</small></span><Icon name="arrow" size={18} /></button>
      <button type="button" onClick={() => openMovement('adjustment')}><span className="quick-actions__icon quick-actions__icon--count"><Icon name="scale" /></span><span><strong>庫存盤點</strong><small>修正現場實際數量</small></span><Icon name="arrow" size={18} /></button>
    </div></section>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel__header"><div><p className="eyebrow">需要處理</p><h2>低庫存商品</h2></div><button className="text-button" type="button" onClick={() => navigate('inventory')}>查看全部 <Icon name="arrow" size={16} /></button></div>
        {lowStock.length === 0 ? <EmptyState title="目前沒有待補貨商品">新增商品並設定安全庫存後，系統會自動提醒。</EmptyState> : <div className="stock-list">{lowStock.slice(0, 4).map((item) => { const level = decimal(item.reorderLevel).gt(0) ? Decimal.min(decimal(item.stock).div(item.reorderLevel).times(100), 100).toNumber() : 100; return <article className="stock-item" key={item.id}><div className="stock-item__top"><div className="stock-item__name"><span>{item.name.slice(0, 1)}</span><div><strong>{item.name}</strong><small>安全庫存 {quantity(item.reorderLevel)} {item.unit}</small></div></div><strong className="stock-item__amount">{quantity(item.stock)} {item.unit}</strong></div><div className="stock-progress"><span style={{ width: `${level}%` }} /></div></article> })}</div>}
      </section>
      <section className="panel"><div className="panel__header"><div><p className="eyebrow">本機紀錄</p><h2>最近異動</h2></div><span className="sync-badge sync-badge--local"><span /> 已儲存</span></div>
        {data.movements.length === 0 ? <EmptyState title="尚無異動紀錄">完成進貨、銷售或盤點後會顯示在這裡。</EmptyState> : <div className="activity-list">{data.movements.slice(0, 5).map((item) => <article className="activity-item" key={item.id}><span className={`activity-item__icon activity-item__icon--${item.type}`}><Icon name={item.type === 'purchase' ? 'inventory' : item.type === 'sale' ? 'sales' : 'scale'} size={19} /></span><div><strong>{item.type === 'sale' ? '銷售出庫' : item.type === 'purchase' ? '進貨入庫' : '盤點調整'}</strong><small>{item.productName} {decimal(item.quantity).isPositive() && item.type !== 'sale' ? '+' : ''}{quantity(item.quantity)} {item.unit}</small></div><time>{new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</time></article>)}</div>}
      </section>
    </div>
  </>
}

function SalesPage({ data, onSale }: { data: LocalAppData; onSale: (productId: string, amount: string, price: string, note: string) => Promise<boolean> }) {
  const [productId, setProductId] = useState(data.products[0]?.id ?? '')
  const [amount, setAmount] = useState('1')
  const [price, setPrice] = useState(data.products[0]?.price ?? '')
  const [note, setNote] = useState('')
  const product = data.products.find((item) => item.id === productId)
  const submit = async (event: FormEvent) => { event.preventDefault(); if (await onSale(productId, amount, price, note)) { setAmount('1'); setNote('') } }
  const selectProduct = (id: string) => { setProductId(id); setPrice(data.products.find((item) => item.id === id)?.price ?? '') }

  return <section className="page-stack"><div className="page-heading"><div><p className="eyebrow">銷售紀錄</p><h2>新增銷售</h2><p>售出後會立即扣除本機庫存，並保存當下售價與成本。</p></div></div>
    {data.products.length === 0 ? <EmptyState title="請先建立商品">前往「庫存」新增商品後，就能開始登記銷售。</EmptyState> : <form className="form-card" onSubmit={submit}>
      <label>商品<select value={productId} onChange={(event) => selectProduct(event.target.value)}>{data.products.map((item) => <option value={item.id} key={item.id}>{item.name}（庫存 {quantity(item.stock)} {item.unit}）</option>)}</select></label>
      <div className="form-grid"><label>銷售數量<input required min="0.001" step="0.001" inputMode="decimal" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>單價（TWD）<input required min="0" step="0.01" inputMode="decimal" type="number" value={price} onChange={(event) => setPrice(event.target.value)} /></label></div>
      <label>備註（選填）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：現場客人" /></label>
      {product && <div className="calculation"><span>本筆金額<strong>{money(decimal(amount || 0).times(price || 0))}</strong></span><span>預估毛利<strong>{money(decimal(amount || 0).times(decimal(price || 0).minus(product.cost)))}</strong></span></div>}
      <button className="primary-button" type="submit">儲存銷售並扣庫存</button>
    </form>}
  </section>
}

function InventoryPage({ data, onAdd, openMovement }: { data: LocalAppData; onAdd: (values: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<boolean>; openMovement: (type: 'purchase' | 'adjustment', product?: Product) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', unit: '份', stock: '0', reorderLevel: '0', cost: '0', price: '0' })
  const submit = async (event: FormEvent) => { event.preventDefault(); if (await onAdd(form)) { setForm({ name: '', unit: '份', stock: '0', reorderLevel: '0', cost: '0', price: '0' }); setShowForm(false) } }
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  return <section className="page-stack"><div className="page-heading page-heading--action"><div><p className="eyebrow">單一倉庫</p><h2>商品與庫存</h2><p>數量支援公斤、箱及 0.5 等小數。</p></div><button className="primary-button primary-button--small" type="button" onClick={() => setShowForm((value) => !value)}><Icon name="plus" size={18} /> 新增商品</button></div>
    {showForm && <form className="form-card" onSubmit={submit}><div className="form-grid"><label>商品名稱<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="例如：鴨頭" /></label><label>單位<input required value={form.unit} onChange={(event) => update('unit', event.target.value)} placeholder="份、公斤、箱" /></label><label>目前庫存<input required min="0" step="0.001" inputMode="decimal" type="number" value={form.stock} onChange={(event) => update('stock', event.target.value)} /></label><label>安全庫存<input required min="0" step="0.001" inputMode="decimal" type="number" value={form.reorderLevel} onChange={(event) => update('reorderLevel', event.target.value)} /></label><label>單位成本<input required min="0" step="0.01" inputMode="decimal" type="number" value={form.cost} onChange={(event) => update('cost', event.target.value)} /></label><label>預設售價<input required min="0" step="0.01" inputMode="decimal" type="number" value={form.price} onChange={(event) => update('price', event.target.value)} /></label></div><button className="primary-button" type="submit">儲存商品</button></form>}
    {data.products.length === 0 ? <EmptyState title="尚未建立商品">按「新增商品」輸入第一個品項，資料會保存在這台裝置。</EmptyState> : <div className="product-grid">{data.products.map((item) => { const low = decimal(item.stock).lte(item.reorderLevel); return <article className={`product-card ${low ? 'product-card--low' : ''}`} key={item.id}><div className="product-card__head"><span>{item.name.slice(0, 1)}</span><div><h3>{item.name}</h3><small>{low ? '需要補貨' : '庫存正常'}</small></div></div><dl><div><dt>目前庫存</dt><dd>{quantity(item.stock)} {item.unit}</dd></div><div><dt>安全庫存</dt><dd>{quantity(item.reorderLevel)} {item.unit}</dd></div><div><dt>平均成本</dt><dd>{money(item.cost)}</dd></div><div><dt>預設售價</dt><dd>{money(item.price)}</dd></div></dl><div className="card-actions"><button type="button" onClick={() => openMovement('purchase', item)}>進貨</button><button type="button" onClick={() => openMovement('adjustment', item)}>盤點</button></div></article> })}</div>}
  </section>
}

function ReportsPage({ data }: { data: LocalAppData }) {
  const sales = data.movements.filter((item) => item.type === 'sale')
  const revenue = sales.reduce((sum, item) => sum.plus(item.revenue), decimal(0))
  const costs = sales.reduce((sum, item) => sum.plus(item.costTotal), decimal(0))
  const profit = revenue.minus(costs)
  const productSales = data.products.map((product) => { const items = sales.filter((item) => item.productId === product.id); return { product, amount: items.reduce((sum, item) => sum.plus(decimal(item.quantity).abs()), decimal(0)), revenue: items.reduce((sum, item) => sum.plus(item.revenue), decimal(0)) } }).filter((item) => item.amount.gt(0)).sort((a, b) => b.revenue.comparedTo(a.revenue))
  return <section className="page-stack"><div className="page-heading"><div><p className="eyebrow">全部本機紀錄</p><h2>營運報表</h2><p>目前統計此裝置內所有銷售資料。</p></div></div><section className="metrics"><MetricCard label="銷售收入" value={money(revenue)} hint={`${sales.length} 筆`} icon="money" accent="orange" /><MetricCard label="銷貨成本" value={money(costs)} hint="依銷售當下成本" icon="box" accent="gold" /><MetricCard label="毛利" value={money(profit)} hint={revenue.gt(0) ? `毛利率 ${profit.div(revenue).times(100).toFixed(1)}%` : '尚無銷售'} icon="trend" accent="green" /><MetricCard label="異動紀錄" value={`${data.movements.length} 筆`} hint="進貨、銷售與盤點" icon="scale" accent="red" /></section><section className="panel"><div className="panel__header"><div><p className="eyebrow">排行</p><h2>商品銷售</h2></div></div>{productSales.length === 0 ? <EmptyState title="尚無銷售資料">完成第一筆銷售後，這裡會計算數量、收入與毛利。</EmptyState> : <div className="report-list">{productSales.map((item, index) => <div key={item.product.id}><span>{index + 1}</span><strong>{item.product.name}</strong><small>{quantity(item.amount)} {item.product.unit}</small><b>{money(item.revenue)}</b></div>)}</div>}</section></section>
}

function SettingsPage({ data, onExport, onImport }: { data: LocalAppData; onExport: () => Promise<void>; onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return <section className="page-stack"><div className="page-heading"><div><p className="eyebrow">資料安全</p><h2>備份與還原</h2><p>清除網站或 App 資料、解除安裝前，請先將備份檔存到安全的位置。</p></div></div><section className="settings-card"><div className="settings-card__icon"><Icon name="check" size={26} /></div><div><h3>本機 IndexedDB</h3><p>目前有 {data.products.length} 項商品、{data.movements.length} 筆異動。資料沒有上傳雲端。</p><small>上次備份：{data.lastBackupAt ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.lastBackupAt)) : '尚未備份'}</small></div></section><section className="backup-grid"><button type="button" onClick={onExport}><Icon name="box" /><strong>匯出 JSON 備份</strong><small>下載或分享後，請儲存到手機或雲端硬碟的安全位置。</small></button><button type="button" onClick={() => fileRef.current?.click()}><Icon name="clock" /><strong>從備份檔還原</strong><small>選擇先前匯出的 JSON，將覆蓋目前資料。</small></button></section><input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={onImport} /><div className="warning-box"><Icon name="alert" size={20} /><p><strong>重要提醒</strong>清除網站或 App 資料、解除安裝可能會刪除本機庫存。JSON 備份是唯一不使用雲端的復原方式。</p></div></section>
}

function MovementDialog({ data, initialType, initialProduct, close, save }: { data: LocalAppData; initialType: 'purchase' | 'adjustment'; initialProduct?: Product; close: () => void; save: (type: 'purchase' | 'adjustment', productId: string, value: string, cost: string, note: string) => Promise<boolean> }) {
  const [type, setType] = useState(initialType)
  const [productId, setProductId] = useState(initialProduct?.id ?? data.products[0]?.id ?? '')
  const [value, setValue] = useState(type === 'purchase' ? '1' : (initialProduct?.stock ?? '0'))
  const [cost, setCost] = useState(initialProduct?.cost ?? '0')
  const [note, setNote] = useState('')
  const product = data.products.find((item) => item.id === productId)
  const changeType = (next: 'purchase' | 'adjustment') => { setType(next); setValue(next === 'purchase' ? '1' : (product?.stock ?? '0')) }
  const submit = async (event: FormEvent) => { event.preventDefault(); if (await save(type, productId, value, cost, note)) close() }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="movement-title"><div className="modal__head"><div><p className="eyebrow">庫存異動</p><h2 id="movement-title">{type === 'purchase' ? '進貨入庫' : '庫存盤點'}</h2></div><button type="button" aria-label="關閉" onClick={close}>×</button></div>{data.products.length === 0 ? <EmptyState title="尚無商品">請先到庫存頁新增商品。</EmptyState> : <form onSubmit={submit}><div className="segmented"><button className={type === 'purchase' ? 'is-active' : ''} type="button" onClick={() => changeType('purchase')}>進貨</button><button className={type === 'adjustment' ? 'is-active' : ''} type="button" onClick={() => changeType('adjustment')}>盤點</button></div><label>商品<select value={productId} onChange={(event) => { const item = data.products.find((entry) => entry.id === event.target.value); setProductId(event.target.value); setCost(item?.cost ?? '0'); if (type === 'adjustment') setValue(item?.stock ?? '0') }}>{data.products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>{type === 'purchase' ? '進貨數量' : '盤點後實際庫存'}<input required min="0" step="0.001" inputMode="decimal" type="number" value={value} onChange={(event) => setValue(event.target.value)} /></label>{type === 'purchase' && <label>本次單位成本（TWD）<input required min="0" step="0.01" inputMode="decimal" type="number" value={cost} onChange={(event) => setCost(event.target.value)} /></label>}<label>備註（選填）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder={type === 'purchase' ? '例如：供應商進貨' : '例如：每日收攤盤點'} /></label>{product && <p className="form-hint">目前庫存：{quantity(product.stock)} {product.unit}</p>}<button className="primary-button" type="submit">儲存異動</button></form>}</section></div>
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [data, setData] = useState<LocalAppData | null>(null)
  const [notice, setNotice] = useState('')
  const [movement, setMovement] = useState<{ type: 'purchase' | 'adjustment'; product?: Product } | null>(null)

  useEffect(() => { loadLocalData().then(setData).catch(() => setNotice('無法讀取本機資料庫')) }, [])
  const today = useMemo(() => new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()), [])
  const currentLabel = navigation.find((item) => item.key === activeView)?.label ?? '總覽'
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600) }
  const persist = async (next: LocalAppData, message: string) => { try { await saveLocalData(next); setData(next); showNotice(message); return true } catch { showNotice('儲存失敗，請稍後再試'); return false } }

  const addProduct = async (values: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!data) return false
    if (data.products.some((item) => item.name.trim() === values.name.trim())) { showNotice('已有相同名稱的商品'); return false }
    if ([values.stock, values.reorderLevel, values.cost, values.price].some((value) => !decimal(value).isFinite() || decimal(value).isNegative())) { showNotice('數量與金額不可小於 0'); return false }
    const now = new Date().toISOString()
    const product: Product = { ...values, name: values.name.trim(), unit: values.unit.trim(), stock: quantity(values.stock), reorderLevel: quantity(values.reorderLevel), cost: decimal(values.cost).toFixed(2), price: decimal(values.price).toFixed(2), id: uniqueId(), createdAt: now, updatedAt: now }
    return persist({ ...data, products: [...data.products, product] }, `已新增 ${product.name}`)
  }

  const addSale = async (productId: string, amount: string, price: string, note: string) => {
    if (!data) return false
    const product = data.products.find((item) => item.id === productId)
    if (!product || !decimal(amount).isPositive() || decimal(price).isNegative()) { showNotice('請檢查銷售資料'); return false }
    if (decimal(amount).gt(product.stock)) { showNotice(`庫存不足，目前只有 ${quantity(product.stock)} ${product.unit}`); return false }
    const now = new Date().toISOString()
    const sold = quantity(amount)
    const movementItem: StockMovement = { id: uniqueId(), type: 'sale', productId, productName: product.name, unit: product.unit, quantity: decimal(sold).negated().toString(), unitPrice: decimal(price).toFixed(2), unitCost: product.cost, revenue: decimal(sold).times(price).toFixed(2), costTotal: decimal(sold).times(product.cost).toFixed(2), note: note.trim(), createdAt: now }
    const products = data.products.map((item) => item.id === productId ? { ...item, stock: decimal(item.stock).minus(sold).toString(), updatedAt: now } : item)
    return persist({ ...data, products, movements: [movementItem, ...data.movements] }, `已記錄 ${product.name} 銷售`)
  }

  const saveMovement = async (type: 'purchase' | 'adjustment', productId: string, value: string, cost: string, note: string) => {
    if (!data) return false
    const product = data.products.find((item) => item.id === productId)
    if (!product || decimal(value).isNegative() || (type === 'purchase' && !decimal(value).isPositive())) { showNotice('請檢查輸入的數量'); return false }
    const now = new Date().toISOString()
    const change = type === 'purchase' ? decimal(value) : decimal(value).minus(product.stock)
    const newStock = type === 'purchase' ? decimal(product.stock).plus(value) : decimal(value)
    const nextCost = type === 'purchase' && newStock.gt(0) ? decimal(product.stock).times(product.cost).plus(decimal(value).times(cost)).div(newStock).toFixed(2) : product.cost
    const movementItem: StockMovement = { id: uniqueId(), type, productId, productName: product.name, unit: product.unit, quantity: change.toString(), unitPrice: '0.00', unitCost: type === 'purchase' ? decimal(cost).toFixed(2) : product.cost, revenue: '0.00', costTotal: decimal(change).times(type === 'purchase' ? cost : product.cost).toFixed(2), note: note.trim(), createdAt: now }
    const products = data.products.map((item) => item.id === productId ? { ...item, stock: newStock.toString(), cost: nextCost, updatedAt: now } : item)
    return persist({ ...data, products, movements: [movementItem, ...data.movements] }, type === 'purchase' ? `已完成 ${product.name} 進貨` : `已更新 ${product.name} 盤點`)
  }

  const exportBackup = async () => {
    if (!data) return
    const backupAt = new Date().toISOString()
    const next = { ...data, lastBackupAt: backupAt }
    const fileName = `東山鴨頭庫存備份-${localDateKey(backupAt)}.json`
    const contents = JSON.stringify(next, null, 2)

    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({
        path: fileName,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      await Share.share({
        title: '東山鴨頭庫存備份',
        text: '請將備份檔儲存到安全的位置。',
        url: file.uri,
        dialogTitle: '儲存或分享 JSON 備份',
      })
    } else {
      const blob = new Blob([contents], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    }

    await persist(next, '備份檔已建立，請儲存到安全位置')
  }

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !data) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isLocalAppData(parsed)) throw new Error('invalid')
      if (!window.confirm('還原後會覆蓋目前所有商品與紀錄，確定繼續嗎？')) return
      await persist(parsed, '備份還原完成')
    } catch { showNotice('備份檔格式不正確') }
  }

  if (!data) return <div className="loading-screen"><BrandMark /><strong>正在開啟本機資料庫…</strong></div>

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><BrandMark /><div><strong>東山鴨頭</strong><small>本機庫存管理</small></div></div><nav className="sidebar-nav" aria-label="主要導覽">{navigation.map((item) => <button type="button" className={activeView === item.key ? 'is-active' : ''} onClick={() => setActiveView(item.key)} key={item.key}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav><div className="sidebar-footer"><span><Icon name="check" size={17} /></span><div><strong>本機資料庫正常</strong><small>資料未上傳雲端</small></div></div></aside><div className="app-main"><header className="topbar"><div><p className="topbar__mobile-label">{currentLabel}</p><h1>{activeView === 'dashboard' ? '今天生意順利！' : currentLabel}</h1><p>{activeView === 'dashboard' ? today : '東山鴨頭本機庫存管理'}</p></div><button type="button" className="profile-button" aria-label="前往備份設定" onClick={() => setActiveView('settings')}><span>本機版</span><strong><Icon name="settings" size={20} /></strong></button></header><main className="content">{activeView === 'dashboard' && <Dashboard data={data} navigate={setActiveView} openMovement={(type, product) => setMovement({ type, product })} />}{activeView === 'sales' && <SalesPage data={data} onSale={addSale} />}{activeView === 'inventory' && <InventoryPage data={data} onAdd={addProduct} openMovement={(type, product) => setMovement({ type, product })} />}{activeView === 'reports' && <ReportsPage data={data} />}{activeView === 'settings' && <SettingsPage data={data} onExport={exportBackup} onImport={importBackup} />}</main><nav className="bottom-nav" aria-label="行動版主要導覽">{navigation.map((item) => <button type="button" className={activeView === item.key ? 'is-active' : ''} onClick={() => setActiveView(item.key)} key={item.key}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}</nav></div>{movement && <MovementDialog data={data} initialType={movement.type} initialProduct={movement.product} close={() => setMovement(null)} save={saveMovement} />}<div className={`toast ${notice ? 'toast--visible' : ''}`} role="status" aria-live="polite"><Icon name="clock" size={18} /> {notice}</div></div>
}

export default App
