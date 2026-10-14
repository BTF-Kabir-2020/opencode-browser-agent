#requires -Version 5.1
<#
  Easy UPDATE: git pull -> rebuild -> redeploy, then restart opencode.
  Same as: .\install.ps1 -Update
#>
& (Join-Path $PSScriptRoot 'install.ps1') -Update
