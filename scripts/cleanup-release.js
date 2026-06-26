#!/usr/bin/env node
// 清理 electron-builder 产生的重复 Draft Release
// 因为 electron-builder 并行发布 blockmap 和 exe 分别触发了两次 createRelease，导致重复
// 这个脚本在 npm run publish 后运行，自动保留最新的完整 release，删除多余的 draft

const { execSync } = require("child_process");

function gh(args) {
  const result = execSync(`gh ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return result.trim();
}

try {
  const pkg = require("../electron-app/package.json");
  const version = pkg.version;
  const repo = `Mujh05/${pkg.build.publish.repo}`;

  console.log(`\n[cleanup-release] 检查 v${version} 的 release 状态...`);

  // 查询所有 v{version} 的 release
  const releases = JSON.parse(
    gh(`api "repos/${repo}/releases" -q '[.[] | select(.tag_name=="v${version}")]'`)
  );

  if (releases.length <= 1) {
    console.log("[cleanup-release] 没有重复 release，跳过");
    process.exit(0);
  }

  const drafts = releases.filter(r => r.draft);
  const published = releases.filter(r => !r.draft);

  if (published.length > 0) {
    console.log(`[cleanup-release] 已存在发布版本 (id=${published[0].id})，删除 ${drafts.length} 个多余的 draft`);
    for (const d of drafts) {
      console.log(`  删除 draft id=${d.id}`);
      gh(`api -X DELETE "repos/${repo}/releases/${d.id}"`);
    }
  } else if (drafts.length > 1) {
    // 全部是 draft：保留有 latest.yml + exe 的那个
    let keep = null;
    for (const d of drafts) {
      const assets = JSON.parse(gh(`api "repos/${repo}/releases/${d.id}" -q '.assets[] | .name'`));
      if (assets.includes("latest.yml") && assets.some(a => a.endsWith(".exe"))) {
        keep = d;
        break;
      }
    }
    if (!keep) {
      // fallback: 保留最新的
      keep = drafts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    console.log(`[cleanup-release] 发布完整 release (id=${keep.id})，删除 ${drafts.length - 1} 个多余的 draft`);
    gh(`api -X PATCH "repos/${repo}/releases/${keep.id}" -f draft=false`);
    for (const d of drafts) {
      if (d.id !== keep.id) {
        console.log(`  删除 draft id=${d.id}`);
        gh(`api -X DELETE "repos/${repo}/releases/${d.id}"`);
      }
    }
  }

  console.log("[cleanup-release] 完成");
} catch (err) {
  console.error("[cleanup-release] 错误:", err.message);
  process.exit(1);
}
