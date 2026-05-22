param(
  [string]$SkillName = "java-code-intelligence",
  [string]$DestinationRoot = "$env:USERPROFILE\.claude\skills"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $repoRoot "skills\$SkillName"

if (-not (Test-Path $source)) {
  throw "Skill source not found: $source"
}

$destinationRootResolved = New-Item -ItemType Directory -Force $DestinationRoot
$destination = Join-Path $destinationRootResolved.FullName $SkillName

if (Test-Path $destination) {
  Remove-Item -LiteralPath $destination -Recurse -Force
}

Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force

Write-Host "Installed Claude Code skill:"
Write-Host "  $destination"
Write-Host ""
Write-Host "Restart Claude Code if this is the first skill directory created in this session."
Write-Host "Invoke with:"
Write-Host "  /$SkillName"
