#!/usr/bin/env node
// 清理 electron-builder 产生的重复 Draft Release
// 使用 gh release list + view 替代复杂 jq 查询

const { execSync } = require("child_process");

function gh(args) { return execSync(`"${process.env.GH_PATH || "gh"}" ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: true }).trim(); }

try {
  const pkg = require("../electron-app/package.json");
  const version = pkg.version;
  const repo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;

  console.log(`[cleanup-release] 检查 v${version} release 状态...`);

  // 列出所有 release，筛选出当前版本的
  // 列出所有 release
  const list = gh(`release list -R ${repo} --limit 50`);
  // gh release list 输出格式：<name>\t<status>\t<tag>\t<date>
  // 例如: 1.3.6\tDraft\tv1.3.6\t2026-06-26T11:18:04Z
  const draftLines = list.split("\n").filter(line =>
    line.includes(`\t${version}\t`) && line.includes("\tDraft\t")
  );
  const latestLines = list.split("\n").filter(line =>
    line.includes(`\t${version}\t`) && line.includes("\tLatest\t")
  );

  if (draftLines.length <= 1 && latestLines.length === 0) {
    console.log("[cleanup-release] 跳过（无重复）");
    process.exit(0);
  }

  // 如果有 Latest release，清理剩余的 Draft（不要清理自己）
  if (published.length > 0) {
    console.log(`[cleanup-release] 已存在 Latest release，清理 ${drafts.length} 个残留 draft...`);
    for (const d of drafts) {
      console.log(`  删除 draft id=${d.id}`);
      gh(`api -X DELETE "repos/${repo}/releases/${d.id}"`);
    }
    console.log("[cleanup-release] 完成");
    process.exit(0);
  }

  // 全部是 draft，需智能处理
  if (draftLines.length > 1) {
    console.log(`[cleanup-release] 发现 ${draftLines.length} 个 draft，找完整的那个...`);
    // 用 gh release view 逐个检查 assets
    let keepTag = null;
    for (const line of draftLines) {
      const columns = line.split("\t");
      const tag = columns[0].trim();
      // release view 按 tag 查，但可能查不到重复 tag，改用 api 按 id 查
      const assets = gh(`release view ${tag} -R ${repo} --json assets -q ".assets[].name"`);
      if (assets.includes("latest.yml") && assets.some(a => a.endsWith(".exe") && !a.endsWith(".exe.blockmap"))) {
        keepTag = tag;
        break;
      }
    }

    if (!keepTag) { keepTag = draftLines[0].split("\t")[0].trim(); }
    console.log(`  发布 ${keepTag}...`);
    gh(`release edit ${keepTag} -R ${repo} --draft=false`);

    for (const line of draftLines) {
      const columns = line.split("\t");
      const tag = columns[0].trim();
      if (tag !== keepTag) {
        console.log(`  删除重复 draft ${tag}`);
        gh(`release delete ${tag} -R ${repo} --cleanup-tag --yes`);
      }
    }
    console.log("[cleanup-release] 完成");
  } else if (draftLines.length === 1) {
    const tag = draftLines[0].split("\t")[0].trim();
    console.log(`  发布 ${tag}...`);
    gh(`release edit ${tag} -R ${repo} --draft=false`);
    console.log("[cleanup-release] 完成");
  }

} catch (err) {
  console.error("[cleanup-release] 错误:", err.message);
  process.exit(1);
}
