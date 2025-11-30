import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";

// 获取所有批量数据Excel文件
function getAllExcelFiles(): string[] {
  const rootDir = `${__dirname}/1129`;
  console.log("rootDir", rootDir);
  const batchDir = path.join(rootDir, "src", "批量爬取");

  let excelFiles: string[] = [];

  // 从根目录获取文件
  const rootFiles = fs.readdirSync(rootDir);
  console.log(rootFiles);

  rootFiles.forEach((file) => {
    if (file.startsWith("36") && file.endsWith(".xlsx")) {
      excelFiles.push(path.join(rootDir, file));
    }
  });

  // 从批量爬取目录获取文件
  if (fs.existsSync(batchDir)) {
    const batchFiles = fs.readdirSync(batchDir);
    batchFiles.forEach((file) => {
      if (file.startsWith("36") && file.endsWith(".xlsx")) {
        excelFiles.push(path.join(batchDir, file));
      }
    });
  }

  return excelFiles;
}

// 从文件名中提取时间戳进行排序
function sortFilesByTimestamp(files: string[]): string[] {
  return files.sort((a, b) => {
    const timestampA =
      a.match(/批量数据_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.xlsx/)?.[1] ||
      "";
    const timestampB =
      b.match(/批量数据_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.xlsx/)?.[1] ||
      "";
    return timestampA.localeCompare(timestampB);
  });
}

// 合并Excel文件
function mergeExcelFiles(files: string[]): XLSX.WorkBook {
  let mergedData: any[] = [];

  files.forEach((file) => {
    try {
      console.log(`处理文件: ${file}`);
      const workbook = XLSX.readFile(file);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      mergedData = [...mergedData, ...data];
    } catch (error) {
      console.error(`处理文件 ${file} 时出错:`, error);
    }
  });

  // 重新排列序号
  mergedData = mergedData.map((item, index) => {
    // 查找序号字段 (可能是 '序号', 'ID', '编号' 等)
    const sequenceFields = ["序号", "ID", "编号", "id", "No.", "NO"];
    const sequenceField = sequenceFields.find((field) => field in item);

    if (sequenceField) {
      return { ...item, [sequenceField]: index + 1 };
    }

    // 如果没有找到序号字段，添加一个新的序号字段
    return { 序号: index + 1, ...item };
  });

  // 创建新的工作簿和工作表
  const newWorkbook = XLSX.utils.book_new();
  const newWorksheet = XLSX.utils.json_to_sheet(mergedData);
  XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "合并数据");

  return newWorkbook;
}

// 主函数
function main() {
  try {
    // 获取所有Excel文件
    let excelFiles = getAllExcelFiles();
    console.log(`找到 ${excelFiles.length} 个批量数据Excel文件`);

    // 按时间戳排序
    excelFiles = sortFilesByTimestamp(excelFiles);

    // 合并文件
    const mergedWorkbook = mergeExcelFiles(excelFiles);

    // 生成输出文件名（当前时间）
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, "-").split(".")[0];
    const outputFile = path.join(__dirname, `合并批量数据_${timestamp}.xlsx`);

    // 写入文件
    XLSX.writeFile(mergedWorkbook, outputFile);
    console.log(`合并完成，已保存到: ${outputFile}`);
  } catch (error) {
    console.error("合并过程中出错:", error);
  }
}

main();
