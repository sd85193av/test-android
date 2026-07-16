import Decimal from 'decimal.js'
import { Workbook, type Cell, type Worksheet } from 'exceljs'
import { isLocalAppData, type LocalAppData, type MovementType, type Product, type StockMovement } from './localDatabase'

const PRODUCT_SHEET = '商品庫存'
const MOVEMENT_SHEET = '所有紀錄'
const ORDER_SHEET = '歷史訂單'
const INFO_SHEET = '使用說明'
const HEADER_COLOR = 'FF8C2F17'

const productHeaders = [
  '商品 ID',
  '商品名稱',
  '單位',
  '目前庫存',
  '安全庫存',
  '單位成本',
  '售價',
  '建立時間',
  '更新時間',
] as const

const movementHeaders = [
  '紀錄 ID',
  '類型',
  '訂單 ID',
  '商品 ID',
  '商品名稱',
  '單位',
  '數量變動',
  '單價',
  '單位成本',
  '銷售收入',
  '成本總額',
  '備註',
  '建立時間',
] as const

const movementLabels: Record<MovementType, string> = {
  sale: '銷售',
  purchase: '進貨',
  adjustment: '盤點',
}

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

function styleDataSheet(worksheet: Worksheet, numericColumns: number[], dateColumns: number[]) {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  }
  worksheet.getRow(1).height = 26
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  numericColumns.forEach((column) => {
    worksheet.getColumn(column).numFmt = '#,##0.###'
  })
  dateColumns.forEach((column) => {
    worksheet.getColumn(column).numFmt = 'yyyy-mm-dd hh:mm:ss'
  })
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F3' } }
      })
    }
  })
}

function addInfoSheet(workbook: Workbook, data: LocalAppData) {
  const worksheet = workbook.addWorksheet(INFO_SHEET)
  worksheet.columns = [{ width: 24 }, { width: 70 }]
  worksheet.mergeCells('A1:B1')
  worksheet.getCell('A1').value = '東山庫存 Excel 資料檔'
  worksheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
  worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } }
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  worksheet.getRow(1).height = 36

  worksheet.addRows([
    [],
    ['格式版本', 'dongshan-inventory-excel-v1'],
    ['資料版本', data.version],
    ['備份時間', data.lastBackupAt ? new Date(data.lastBackupAt) : new Date()],
    [],
    ['使用方式', '可以使用 Excel 開啟、篩選及編輯此檔案，再回到網站的設定頁轉換成 JSON 備份。'],
    ['可編輯工作表', `請在「${PRODUCT_SHEET}」與「${MOVEMENT_SHEET}」工作表編輯原始資料。`],
    ['歷史訂單', `「${ORDER_SHEET}」為閱讀用摘要，轉回 JSON 時會由所有紀錄重新計算。`],
    ['重要提醒', '請勿修改工作表名稱或第一列欄位名稱；商品與紀錄 ID 留白時，轉換時會自動建立。'],
    ['匯入提醒', 'Excel 轉 JSON 不會立即覆蓋網站資料，仍需使用「匯入備份」確認還原。'],
  ])
  worksheet.getCell('B5').numFmt = 'yyyy-mm-dd hh:mm:ss'
  worksheet.getColumn(1).font = { bold: true }
  worksheet.getColumn(1).alignment = { vertical: 'top' }
  worksheet.getColumn(2).alignment = { vertical: 'top', wrapText: true }
}

function addProductSheet(workbook: Workbook, products: Product[]) {
  const worksheet = workbook.addWorksheet(PRODUCT_SHEET)
  worksheet.columns = [
    { header: productHeaders[0], key: 'id', width: 38 },
    { header: productHeaders[1], key: 'name', width: 24 },
    { header: productHeaders[2], key: 'unit', width: 10 },
    { header: productHeaders[3], key: 'stock', width: 14 },
    { header: productHeaders[4], key: 'reorderLevel', width: 14 },
    { header: productHeaders[5], key: 'cost', width: 14 },
    { header: productHeaders[6], key: 'price', width: 14 },
    { header: productHeaders[7], key: 'createdAt', width: 22 },
    { header: productHeaders[8], key: 'updatedAt', width: 22 },
  ]
  products.forEach((product) => worksheet.addRow({
    id: product.id,
    name: product.name,
    unit: product.unit,
    stock: Number(product.stock),
    reorderLevel: Number(product.reorderLevel),
    cost: Number(product.cost),
    price: Number(product.price),
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  }))
  styleDataSheet(worksheet, [4, 5, 6, 7], [8, 9])
}

function addMovementSheet(workbook: Workbook, movements: StockMovement[]) {
  const worksheet = workbook.addWorksheet(MOVEMENT_SHEET)
  worksheet.columns = [
    { header: movementHeaders[0], key: 'id', width: 38 },
    { header: movementHeaders[1], key: 'type', width: 10 },
    { header: movementHeaders[2], key: 'orderId', width: 38 },
    { header: movementHeaders[3], key: 'productId', width: 38 },
    { header: movementHeaders[4], key: 'productName', width: 24 },
    { header: movementHeaders[5], key: 'unit', width: 10 },
    { header: movementHeaders[6], key: 'quantity', width: 14 },
    { header: movementHeaders[7], key: 'unitPrice', width: 14 },
    { header: movementHeaders[8], key: 'unitCost', width: 14 },
    { header: movementHeaders[9], key: 'revenue', width: 14 },
    { header: movementHeaders[10], key: 'costTotal', width: 14 },
    { header: movementHeaders[11], key: 'note', width: 28 },
    { header: movementHeaders[12], key: 'createdAt', width: 22 },
  ]
  movements.forEach((movement) => worksheet.addRow({
    id: movement.id,
    type: movementLabels[movement.type],
    orderId: movement.orderId ?? '',
    productId: movement.productId,
    productName: movement.productName,
    unit: movement.unit,
    quantity: Number(movement.quantity),
    unitPrice: Number(movement.unitPrice),
    unitCost: Number(movement.unitCost),
    revenue: Number(movement.revenue),
    costTotal: Number(movement.costTotal),
    note: movement.note,
    createdAt: new Date(movement.createdAt),
  }))
  styleDataSheet(worksheet, [7, 8, 9, 10, 11], [13])
}

function addOrderSheet(workbook: Workbook, movements: StockMovement[]) {
  const orders = movements.reduce((map, movement) => {
    if (movement.type !== 'sale') return map
    const orderId = movement.orderId ?? movement.id
    const current = map.get(orderId) ?? {
      orderId,
      createdAt: movement.createdAt,
      itemCount: 0,
      quantity: new Decimal(0),
      revenue: new Decimal(0),
      cost: new Decimal(0),
    }
    current.itemCount += 1
    current.quantity = current.quantity.plus(new Decimal(movement.quantity).abs())
    current.revenue = current.revenue.plus(movement.revenue)
    current.cost = current.cost.plus(movement.costTotal)
    if (movement.createdAt > current.createdAt) current.createdAt = movement.createdAt
    map.set(orderId, current)
    return map
  }, new Map<string, {
    orderId: string
    createdAt: string
    itemCount: number
    quantity: Decimal
    revenue: Decimal
    cost: Decimal
  }>())

  const worksheet = workbook.addWorksheet(ORDER_SHEET)
  worksheet.columns = [
    { header: '訂單 ID', key: 'orderId', width: 38 },
    { header: '訂單時間', key: 'createdAt', width: 22 },
    { header: '品項數', key: 'itemCount', width: 12 },
    { header: '銷售數量', key: 'quantity', width: 14 },
    { header: '銷售金額', key: 'revenue', width: 14 },
    { header: '訂單成本', key: 'cost', width: 14 },
    { header: '訂單毛利', key: 'profit', width: 14 },
  ]
  Array.from(orders.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((order) => worksheet.addRow({
      orderId: order.orderId,
      createdAt: new Date(order.createdAt),
      itemCount: order.itemCount,
      quantity: order.quantity.toNumber(),
      revenue: order.revenue.toNumber(),
      cost: order.cost.toNumber(),
      profit: order.revenue.minus(order.cost).toNumber(),
    }))
  styleDataSheet(worksheet, [3, 4, 5, 6, 7], [2])
}

export async function createExcelBackup(data: LocalAppData): Promise<Uint8Array> {
  const workbook = new Workbook()
  workbook.creator = '東山庫存管理'
  workbook.created = new Date()
  workbook.modified = new Date()
  addInfoSheet(workbook, data)
  addProductSheet(workbook, data.products)
  addMovementSheet(workbook, data.movements)
  addOrderSheet(workbook, data.movements)
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

function rawCellValue(cell: Cell): unknown {
  const value = cell.value
  if (value === null || value === undefined || value instanceof Date) return value
  if (typeof value !== 'object') return value

  const record = value as unknown as Record<string, unknown>
  if ('result' in record) return record.result
  if (Array.isArray(record.richText)) {
    return record.richText.map((part) => {
      if (typeof part !== 'object' || part === null) return ''
      return String((part as Record<string, unknown>).text ?? '')
    }).join('')
  }
  if (typeof record.text === 'string') return record.text
  return String(value)
}

function textValue(cell: Cell) {
  const value = rawCellValue(cell)
  return value === null || value === undefined ? '' : String(value).trim()
}

function requiredText(cell: Cell, field: string, rowNumber: number) {
  const value = textValue(cell)
  if (!value) throw new Error(`第 ${rowNumber} 列缺少「${field}」。`)
  return value
}

function decimalValue(cell: Cell, field: string, rowNumber: number, nonNegative = false) {
  const value = requiredText(cell, field, rowNumber)
  try {
    const number = new Decimal(value.replace(/,/g, ''))
    if (!number.isFinite() || (nonNegative && number.isNegative())) throw new Error('invalid')
    return number.toString()
  } catch {
    throw new Error(`第 ${rowNumber} 列的「${field}」不是有效數字。`)
  }
}

function timestampValue(cell: Cell, field: string, rowNumber: number, fallback: string) {
  const raw = rawCellValue(cell)
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback
  const date = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(date.getTime())) throw new Error(`第 ${rowNumber} 列的「${field}」不是有效日期。`)
  return date.toISOString()
}

function headerMap(worksheet: Worksheet, expectedHeaders: readonly string[]) {
  const headers = new Map<string, number>()
  worksheet.getRow(1).eachCell((cell, columnNumber) => headers.set(textValue(cell), columnNumber))
  const missing = expectedHeaders.filter((header) => !headers.has(header))
  if (missing.length > 0) throw new Error(`「${worksheet.name}」缺少欄位：${missing.join('、')}。`)
  return headers
}

function cellFor(worksheet: Worksheet, headers: Map<string, number>, rowNumber: number, header: string) {
  return worksheet.getRow(rowNumber).getCell(headers.get(header)!)
}

function parseMovementType(value: string, rowNumber: number): MovementType {
  const types: Record<string, MovementType> = {
    sale: 'sale',
    銷售: 'sale',
    purchase: 'purchase',
    進貨: 'purchase',
    adjustment: 'adjustment',
    盤點: 'adjustment',
    調整: 'adjustment',
  }
  const type = types[value.toLowerCase()] ?? types[value]
  if (!type) throw new Error(`第 ${rowNumber} 列的「類型」必須是銷售、進貨或盤點。`)
  return type
}

function parseProducts(worksheet: Worksheet) {
  const headers = headerMap(worksheet, productHeaders)
  const products: Product[] = []
  const now = new Date().toISOString()

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const nameCell = cellFor(worksheet, headers, rowNumber, productHeaders[1])
    if (!textValue(nameCell)) continue
    const createdAt = timestampValue(
      cellFor(worksheet, headers, rowNumber, productHeaders[7]),
      productHeaders[7],
      rowNumber,
      now,
    )
    products.push({
      id: textValue(cellFor(worksheet, headers, rowNumber, productHeaders[0])) || createId(),
      name: requiredText(nameCell, productHeaders[1], rowNumber),
      unit: requiredText(cellFor(worksheet, headers, rowNumber, productHeaders[2]), productHeaders[2], rowNumber),
      stock: decimalValue(cellFor(worksheet, headers, rowNumber, productHeaders[3]), productHeaders[3], rowNumber, true),
      reorderLevel: decimalValue(cellFor(worksheet, headers, rowNumber, productHeaders[4]), productHeaders[4], rowNumber, true),
      cost: decimalValue(cellFor(worksheet, headers, rowNumber, productHeaders[5]), productHeaders[5], rowNumber, true),
      price: decimalValue(cellFor(worksheet, headers, rowNumber, productHeaders[6]), productHeaders[6], rowNumber, true),
      createdAt,
      updatedAt: timestampValue(
        cellFor(worksheet, headers, rowNumber, productHeaders[8]),
        productHeaders[8],
        rowNumber,
        createdAt,
      ),
    })
  }
  return products
}

function parseMovements(worksheet: Worksheet, products: Product[]) {
  const headers = headerMap(worksheet, movementHeaders)
  const movements: StockMovement[] = []
  const productsByName = new Map(products.map((product) => [product.name, product]))
  const now = new Date().toISOString()

  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const productNameCell = cellFor(worksheet, headers, rowNumber, movementHeaders[4])
    if (!textValue(productNameCell)) continue
    const productName = requiredText(productNameCell, movementHeaders[4], rowNumber)
    const matchingProduct = productsByName.get(productName)
    const productId = textValue(cellFor(worksheet, headers, rowNumber, movementHeaders[3])) || matchingProduct?.id
    if (!productId) throw new Error(`第 ${rowNumber} 列的商品「${productName}」找不到商品 ID。`)
    const id = textValue(cellFor(worksheet, headers, rowNumber, movementHeaders[0])) || createId()
    const orderId = textValue(cellFor(worksheet, headers, rowNumber, movementHeaders[2]))
    movements.push({
      id,
      type: parseMovementType(
        requiredText(cellFor(worksheet, headers, rowNumber, movementHeaders[1]), movementHeaders[1], rowNumber),
        rowNumber,
      ),
      ...(orderId ? { orderId } : {}),
      productId,
      productName,
      unit: textValue(cellFor(worksheet, headers, rowNumber, movementHeaders[5])) || matchingProduct?.unit || '個',
      quantity: decimalValue(cellFor(worksheet, headers, rowNumber, movementHeaders[6]), movementHeaders[6], rowNumber),
      unitPrice: decimalValue(cellFor(worksheet, headers, rowNumber, movementHeaders[7]), movementHeaders[7], rowNumber, true),
      unitCost: decimalValue(cellFor(worksheet, headers, rowNumber, movementHeaders[8]), movementHeaders[8], rowNumber, true),
      revenue: decimalValue(cellFor(worksheet, headers, rowNumber, movementHeaders[9]), movementHeaders[9], rowNumber, true),
      costTotal: decimalValue(cellFor(worksheet, headers, rowNumber, movementHeaders[10]), movementHeaders[10], rowNumber),
      note: textValue(cellFor(worksheet, headers, rowNumber, movementHeaders[11])),
      createdAt: timestampValue(
        cellFor(worksheet, headers, rowNumber, movementHeaders[12]),
        movementHeaders[12],
        rowNumber,
        now,
      ),
    })
  }
  return movements
}

export async function parseExcelBackup(contents: ArrayBuffer): Promise<LocalAppData> {
  const workbook = new Workbook()
  await workbook.xlsx.load(contents as never)
  const productSheet = workbook.getWorksheet(PRODUCT_SHEET)
  const movementSheet = workbook.getWorksheet(MOVEMENT_SHEET)
  if (!productSheet || !movementSheet) {
    throw new Error(`Excel 必須包含「${PRODUCT_SHEET}」與「${MOVEMENT_SHEET}」工作表。`)
  }

  const products = parseProducts(productSheet)
  const movements = parseMovements(movementSheet, products)
  const infoSheet = workbook.getWorksheet(INFO_SHEET)
  const backupAt = infoSheet
    ? timestampValue(infoSheet.getCell('B5'), '備份時間', 5, new Date().toISOString())
    : new Date().toISOString()
  const data: LocalAppData = {
    version: 1,
    products,
    movements,
    lastBackupAt: backupAt,
  }
  if (!isLocalAppData(data)) throw new Error('Excel 內容無法轉換成有效的網站備份。')
  return data
}
