import { world, system } from '@minecraft/server'
import { ActionFormData, ModalFormData } from '@minecraft/server-ui'
// -------------------- Bounty Command --------------------
const commands = [
{
  name: "bounty",
  description: "Set a bounty on a player.",
  syntax: "bounty <target> <amount>",
  callback(player, args, e) {
    e.cancel = true
    if (args.length < 2) {
      player.sendMessage('§cYou need to provide a name and an amount.')
      return;
    }

    const fullMessage = args.join(" ")
    const match = fullMessage.match(/^"(.*?)"\s+(\d+)\s*(.*)$|^(\S+)\s+(\d+)\s*(.*)$/);

    if (!match) {
      player.sendMessage('§cPlease use: §e:bounty <"Player Name"> <Amount> §cor §e:bounty <PlayerName> <Amount>');
      return;
    }

    const targetName = match[1] || match[4];
    const amount = parseInt(match[2] || match[5]);
    const target = world.getPlayers().find(p => p.name.toLowerCase() === targetName.toLowerCase());

    if (!target) return player.sendMessage(`[Bounty-System]: §cPlayer §e${targetName}§c was not found.`);
    if (isNaN(amount) || amount <= 0) return player.sendMessage(`[Bounty-System]: §cPlease enter a positive number.`);
    if (amount > score(player, 'geld')) return player.sendMessage(`[Bounty-System]: §cYou don't have enough money. §bYou only have §l${score(player, 'geld')} coins.`);

    setBounty(target, player, amount)
  }
},
{
  name: 'bounty-menu',
  description: 'Open the Bounty Menu',
  syntax: 'bounty-menu',
  callback(player, args, e) {
    e.cancel = true;
    system.run(() => {
    bountyMenu(player);
    })
  }
}
]
function parseCommands(player, message, event) {
  const args = message.trim().toLowerCase().split(' ')
  const cmdName = args.shift()
  const command = commands.find(cmd => cmd.name.toLowerCase() === cmdName)
  
  if (!command) {
    event.cancel = true;
    player.sendMessage(`§cUnknown Command: §e${cmdName}§c.`)
    return;
  }
  command.callback(player, args, event)
}
world.beforeEvents.chatSend.subscribe((e) => {
  if (e.message.startsWith('!')) return parseCommands(e.sender, e.message.substring(1), e)
})
// -------------------- setBounty Function --------------------
function setBounty(target, setter, amount) {
  let bounty = target.getDynamicProperty('bounty')
  bounty = bounty ? JSON.parse(bounty) : {}

  if (bounty.hasOwnProperty(setter.name)) {
    const values = bounty[setter.name]
    const oldAmount = values && values.amount ? values.amount : 0
    const newAmount = oldAmount + amount
    const update = {
      day: new Date().getDate(),
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    }
    const firstSetData = bounty[setter.name] && bounty[setter.name].firstSet ? bounty[setter.name].firstSet : update
    bounty[setter.name] = {
      amount: newAmount,
      firstSet: firstSetData,
      lastUpdate: update
    }

    const firstSetTotal = bounty['total'] && bounty['total'].firstSet ? bounty['total'].firstSet : update
    const totalAmountToAdd = bounty['total'] && bounty['total'].amount ? bounty['total'].amount : 0
    bounty["total"] = {
      amount: amount + totalAmountToAdd,
      firstSet: firstSetTotal
    }

    system.run(() => {
      target.setDynamicProperty('bounty', JSON.stringify(bounty))
      removeScore(setter, 'geld', amount)
      setter.sendMessage(`§bYou have set a bounty on ${target.name}.`)
      target.playSound('mob.creaking.deactivate')
      setter.playSound('block.end_portal_frame.fill')
    })

  } else {
    const time = {
      day: new Date().getDate(),
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    }
    bounty[setter.name] = {
      amount: amount,
      firstSet: time,
      lastUpdate: time
    }
    const addAmount = bounty['total'] && bounty['total'].amount ? bounty['total'].amount : 0
    bounty["total"] = {
      amount: amount + addAmount,
      firstSet: time
    }

    system.run(() => {
      target.setDynamicProperty('bounty', JSON.stringify(bounty))
      removeScore(setter, 'geld', amount)
      setter.sendMessage(`§bYou have set a bounty on ${target.name}.`)
      target.playSound('mob.creaking.deactivate')
      setter.playSound('block.end_portal_frame.fill')
    })
  }
}

// -------------------- Bounty Death Handler --------------------
world.afterEvents.entityDie.subscribe((e) => {
  const entity = e.deadEntity
  const damage = e.damageSource
  if (entity.typeId === "minecraft:player") {
    const cords = entity.location
    const head = new ItemStack('minecraft:player_head', 1);
    entity.sendMessage(`§l§c»§r §cYou died at §e${[cords.x.toFixed(0), cords.y.toFixed(0), cords.z.toFixed(0)].join(' ')}§c.`)
    entity.setDynamicProperty('inCombat', '§aout of combat§r')
    addScore(entity, 'deaths', 1)

    if (damage.damagingEntity.typeId === 'minecraft:player') {
      let bounty = entity.getDynamicProperty('bounty')
      bounty = bounty ? JSON.parse(bounty) : undefined
      if (bounty) {
        const total = bounty['total']
        world.scoreboard.getObjective('money').addScore(damage.damagingEntity, total.amount)
        damage.damagingEntity.sendMessage(`[Bounty]: §e${entity.name}§a had a bounty of §9${total.amount}. §7[+${total.amount}]`)
        damage.damagingEntity.playSound('random.orb')
        entity.setDynamicProperty('bounty')
      }

      head.setLore([
        `${damage.damagingEntity.name} killed ${entity.name}`,
        `§c${damage.damagingEntity.name}'s kills: ${score(damage.damagingEntity, 'kills') + 1}`,
        `§t${entity.name}'s deaths: ${score(entity, 'deaths') + 1}`
      ])
      damage.damagingEntity.dimension.spawnItem(head, { x: cords.x, y: cords.y, z: cords.z })
      damage.damagingEntity.sendMessage(`§c§l»§r §cYou killed §e${entity.name} `)
      addScore(entity, 'kills', 1)
    }
  }
})
function bountyMenu(player) {
  const ui = new ActionFormData()
    .title('Bounty Menu')
    .body('Here you can manage everything related to bounties.')
    .button('Set a Bounty', 'textures/items/bow_pulling_2')
    .button('Show All Bounties', 'textures/ui/bounty')
    .show(player).then((r) => {
      if (r.cancelationReason === "UserBusy") {
        return system.runTimeout(() => {bountyMenu(player) }, 10)
    }
      if (r.canceled) return;

      switch (r.selection) {
        case 0:
          setBountyMenu(player)
          break;
        case 1:
          allBountys(player)
          break;
      }
    })
}
function setBountyMenu(player) {
  const allPlayers = world.getAllPlayers().filter(p => p.name !== player.name)
  if (allPlayers.length <= 0) return player.sendMessage('§eNo players are online.')

  const ui = new ModalFormData()
    .title('Set Bounty')
    .dropdown('Choose a player.', allPlayers.map(p => p.name))
    .textField('Enter how much you want to set.', '100')
    .show(player).then((r) => {
      if (r.canceled) return;

      const target = allPlayers[r.formValues[0]]
      const amount = parseInt(r.formValues[1])

      if (!target) return player.sendMessage('§cPlayer is no longer online.')
      if (isNaN(amount) || amount <= 0) return player.sendMessage(`[Bounty-System]: §cPlease enter a positive number.`)
      if (amount > score(player, 'geld')) return player.sendMessage(`[Bounty-System]: §cNot enough money. §bYou only have §l${score(player, 'geld')} coins.`)

      setBounty(target, player, amount)
    })
}
function allBountys(player) {
  const bountyPlayers = world.getAllPlayers().filter(p => p.getDynamicProperty('bounty'))
  
  const text = bountyPlayers.length ? 'All active bounties. §7Click for more details.' : 'No bounties found.'

  const ui = new ActionFormData()
    .title('All Bounties')
    .body(text)

  bountyPlayers.forEach((p) => {
    let bounty = p.getDynamicProperty('bounty')
    bounty = bounty ? JSON.parse(bounty) : {}
    ui.button(`${p.name} \n§8Bounty Amount: ${bounty.total.amount}`)
  })

  ui.button('Ok')
  ui.show(player).then((r) => {
    if (r.canceled) return;

    const selected = bountyPlayers[r.selection]
    if (!selected) return player.sendMessage('§cSomething went wrong.')

    specificBounty(player, selected)
  })
}
function specificBounty(viewer, player) {
  let bountyData = player.getDynamicProperty('bounty')
  bountyData = bountyData ? JSON.parse(bountyData) : {}

  const ui = new ActionFormData()
    .title(player.name)
    .body(`Info: \n§pTotal Amount§7: ${bountyData['total'].amount} \n§pFirst Set Date§7: ${[bountyData.total.firstSet.day, bountyData.total.firstSet.month, bountyData.total.firstSet.year].join('.')} \nThese are all players who set bounties on this player.`)

  for (const setter in bountyData) ui.button(setter + '\n§8[Click for more details.]')
  

  ui.show(viewer).then((r) => {
    if (r.canceled) return;

    const selectedName = Object.keys(bountyData)[r.selection]
    specificBountySetter(viewer, player, selectedName)
  })
}
function specificBountySetter(viewer, player, setter) {
  let bountyData = player.getDynamicProperty('bounty')
  bountyData = bountyData ? JSON.parse(bountyData) : {}
  const setterData = bountyData[setter]

  const extra = setter === 'total' ? '' : `Last update: §7${[setterData.lastUpdate.day, setterData.lastUpdate.month, setterData.lastUpdate.year].join('.')}`
  const ui = new ActionFormData()
    .title(setter)
    .body(`§eInfo§f: \n§pAmount§7: ${setterData.amount} \n§pFirst Set§7: ${[setterData.firstSet.day, setterData.firstSet.month, setterData.firstSet.year].join('.')} \n§p${extra}`)
    .button('Ok')

  ui.show(viewer).then((r) => {
    if (r.canceled) return;
    specificBounty(viewer, player)
  })
}
function score(player, objective) {
const obj = world.scoreboard.getObjective(objective)
const score = obj.getScore(player)
return score
}
