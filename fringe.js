/*  Lunatic Fringe - http://code.google.com/p/lunatic-fringe/
    Copyright (C) 2011-2013 James Carnley, Lucas Riutzel, 

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
/* JSLint validation options */
/*jslint devel: true, browser: true, maxerr: 50, indent: 4 */
/*global Audio: false */
var LunaticFringe = function (canvas) {
    "use strict";

    var animationLoop, objectManager, mediaManager, Key, DEBUG = false, numEnemiesKilled = 0, score = 0;
    var game = this;

    if (typeof canvas !== 'object') {
        canvas = document.getElementById(canvas);
    }

    // Opera sort of blows and doesn't support Object.create at this time
    if (typeof Object.create !== 'function') {
        Object.create = function (o) {
            function F() { }
            F.prototype = o;
            return new F();
        };
    }

    // This is simpler than parsing the query string manually. The better regex solutions gave JSLint hell so I removed them.
    if (window.location.href.indexOf("debug=1") !== -1) {
        DEBUG = true;
    }

    function log(message) {
        if (DEBUG) {
            try {
                console.log(message);
            } catch (e) { }
        }
    }

    Key = {
        keysPressed: {},

        SPACE: 32,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,

        isDown: function (keyCode) {
            return this.keysPressed[keyCode];
        },

        onKeydown: function (event) {
            this.keysPressed[event.keyCode] = true;
        },

        onKeyup: function (event) {
            delete this.keysPressed[event.keyCode];
        }
    };
    //
    // Vector helper class
    var Vector = function (x, y) {
        this.X = x || 0;
        this.Y = y || 0;
    }
    Vector.prototype.Copy = function () { return new Vector(this.X, this.Y); }
    Vector.prototype.Add = function (other) { return this.Copy()._Add(other); }
    Vector.prototype._Add = function (other) { this.X += other.X; this.Y += other.Y; return this; }
    Vector.prototype.Subtract = function (other) { return this.Copy()._Subtract(other); }
    Vector.prototype._Subtract = function (other) { this.X -= other.X; this.Y -= other.Y; return this; }
    Vector.prototype.Scale = function (scalar) { return this.Copy()._Scale(scalar); }
    Vector.prototype._Scale = function (scalar) { this.X *= scalar; this.Y *= scalar; return this; }
    Vector.prototype.DotProduct = function (other) { return this.X * other.X + this.Y * other.Y; }
    Vector.prototype.SelfDotProduct = function () { return this.DotProduct(this); }
    Vector.prototype.Normalize = function (other) { return this.Copy().Scale(1 / this.Magnitude()); }
    Vector.prototype.Magnitude = function () { return Math.sqrt(this.SelfDotProduct()); }

    // This is primarily to make sure media is preloaded, otherwise projectiles only load when fire is pressed and looks funky
    this.mediaManager = new LunaticFringe.MediaManager();

    // Game Objects
    function GameObject() {

        this.X = 0;
        this.Y = 0;
        this.Width = 0;
        this.Height = 0;
        this.VelocityX = 0;
        this.VelocityY = 0;
        this.Mass = 0;
        this.CollisionRadius = 0;
        this.Sprite = null;

        GameObject.prototype.updateState = function () {
            //console.log("GameObject - updateState");
        };

        GameObject.prototype.draw = function (context) {
            if (DEBUG) {
                // Draw collision circle
                context.beginPath();
                context.strokeStyle = "blue";
                context.arc(this.X, this.Y, this.CollisionRadius, 0, Math.PI * 2);
                context.stroke();

                // Draw object angle
                context.beginPath();
                context.strokeStyle = "blue";
                context.moveTo(this.X, this.Y);
                if (this instanceof PlayerShip) {
                    context.lineTo(this.X + -Math.cos(this.Angle) * this.CollisionRadius * 2, this.Y + -Math.sin(this.Angle) * this.CollisionRadius * 2);
                } else {
                    context.lineTo(this.X + Math.cos(this.Angle) * this.CollisionRadius * 2, this.Y + Math.sin(this.Angle) * this.CollisionRadius * 2);
                }
                context.stroke();
            }
        };

        GameObject.prototype.handleCollision = function (otherObject) {
            var i, j, dx, dy, phi, magnitude_1, magnitude_2, direction_1, direction_2, new_xspeed_1, new_xspeed_2, new_yspeed_1, new_yspeed_2, final_xspeed_1, final_yspeed_1, final_xspeed_2, final_yspeed_2;

            dx = this.X - otherObject.X;
            dy = this.Y - otherObject.Y;

            phi = Math.atan2(dy, dx);

            magnitude_1 = Math.sqrt(this.VelocityX * this.VelocityX + this.VelocityY * this.VelocityY);
            magnitude_2 = Math.sqrt(otherObject.VelocityX * otherObject.VelocityX + otherObject.VelocityY * otherObject.VelocityY);

            direction_1 = Math.atan2(this.VelocityY, this.VelocityX);
            direction_2 = Math.atan2(otherObject.VelocityY, otherObject.VelocityX);

            new_xspeed_1 = magnitude_1 * Math.cos(direction_1 - phi);
            new_yspeed_1 = magnitude_1 * Math.sin(direction_1 - phi);

            new_xspeed_2 = magnitude_2 * Math.cos(direction_2 - phi);
            //new_yspeed_2 = magnitude_2 * Math.sin(direction_2 - phi);

            final_xspeed_1 = ((this.Mass - otherObject.Mass) * new_xspeed_1 + (otherObject.Mass + otherObject.Mass) * new_xspeed_2) / (this.Mass + otherObject.Mass);
            //final_xspeed_2 = ((this.Mass + this.Mass) * new_xspeed_1 + (otherObject.Mass - this.Mass) * new_xspeed_2) / (this.Mass + otherObject.Mass);

            final_yspeed_1 = new_yspeed_1;
            //final_yspeed_2 = new_yspeed_2;

            this.VelocityX = Math.cos(phi) * final_xspeed_1 + Math.cos(phi + Math.PI / 2) * final_yspeed_1;
            this.VelocityY = Math.sin(phi) * final_xspeed_1 + Math.sin(phi + Math.PI / 2) * final_yspeed_1;
            //otherObject.VelocityX = Math.cos(phi) * final_xspeed_2 + Math.cos(phi + Math.PI / 2) * final_yspeed_2;
            //otherObject.VelocityY = Math.sin(phi) * final_xspeed_2 + Math.sin(phi + Math.PI / 2) * final_yspeed_2;
        };

        GameObject.prototype.processInput = function (KeyState) {
            //console.log("GameObject - processInput");
        };

        GameObject.prototype.calculateAcceleration = function () {

            var currentVelocity = new Vector(this.VelocityX, this.VelocityY);

            var acceleration;

            // The ship forces are opposite everything else. It doesn't move, it shifts the universe around it.
            if (this instanceof PlayerShip) {
                acceleration = new Vector(-Math.cos(this.Angle) * this.Acceleration, Math.sin(-this.Angle) * this.Acceleration);
            } else {
                acceleration = new Vector(Math.cos(this.Angle) * this.Acceleration, Math.sin(this.Angle) * this.Acceleration);
            }

            var newVelocity = currentVelocity.Add(acceleration);

            // Only apply Lorentz factor if acceleration increases speed
            if (newVelocity.Magnitude() > currentVelocity.Magnitude()) {
                var b = 1 - ((currentVelocity.Magnitude() * currentVelocity.Magnitude()) / (this.MaxSpeed * this.MaxSpeed));

                // If b is negative then just make it very small to prevent errors in the square root
                if (b <= 0) { b = 0.0000000001; }

                var lorentz_factor = Math.sqrt(b);

                acceleration = acceleration.Scale(lorentz_factor);
            }

            currentVelocity = currentVelocity.Add(acceleration);

            /* Allow acceleration in the forward direction to change the direction
            of currentVelocity by using the direction of newVelocity (without the Lorentz factor)
            with the magnitude of currentVelocity (that applies the Lorentz factor). Without this
            the ship is almost impossible to turn when at max speed. */
            if (currentVelocity.Magnitude() > 0) {
                currentVelocity = newVelocity.Normalize().Scale(currentVelocity.Magnitude());
            }

            this.VelocityX = currentVelocity.X;
            this.VelocityY = currentVelocity.Y;
        }
    }

    // All AI inherit from this
    function AIGameObject(playerShip) {
        GameObject.call(this);

        this.relativePositionTo = function (object) {
          var X = object.X - this.X;
          var Y = object.Y - this.Y;
          return {x: X, y: Y};
        };

        this.angleTo = function (object) {
          var rel = this.relativePositionTo(object);
          return Math.atan2(rel.y, rel.x);
        };

        this.angleDiffTo = function (object) {
          var angleDiff, angleToObject;
          angleToObject = this.angleTo(object);
          angleDiff = angleToObject - this.Angle;

          // when calculating angle diff compensate when the angle swiches to the opposite side
          // of the angle spectrem. eg: a ship flys from 10deg->0deg->350deg
          // this is important when doing gradual shifts to angles and not cause
          // the shift to loop around the circle long ways
          if ( Math.abs(angleDiff) > Math.PI ) {
            if (angleDiff > 0) this.Angle += (Math.PI*2);
            else this.Angle -= (Math.PI*2);

            // recalculate diff now that we have adjusted the angle
            angleDiff = angleToObject - this.Angle;
          }

          return angleDiff;
        };
    }
    AIGameObject.prototype = Object.create(GameObject.prototype);
    AIGameObject.prototype.constructor = AIGameObject;

    function Projectile(ship) {
        var tickCountSince;
        GameObject.call(this);
        if (ship === undefined) {
            return;
        }

        this.X = ship.X + (-Math.cos(ship.Angle) * ship.CollisionRadius);
        this.Y = ship.Y + (-Math.sin(ship.Angle) * ship.CollisionRadius);
        this.VelocityX = ship.VelocityX;
        this.VelocityY = ship.VelocityY;
        this.Lifetime = 0;

        objectManager.addObject(this, true);

        tickCountSince = {
            Creation: 0
        };

        this.draw = function (context) {
            Projectile.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, this.X - this.Width / 2, this.Y - this.Height / 2);
        };

        this.handleCollision = function (otherObject) {
            Projectile.prototype.handleCollision.call(this, otherObject);
            if (otherObject instanceof AIGameObject) {
                log("Projectile hit something!");
                objectManager.removeObject(this);
            }
        };

        this.updateState = function () {
            var i;

            for (i in tickCountSince) {
                if (tickCountSince.hasOwnProperty(i)) {
                    tickCountSince[i] += 1;
                }
            }

            this.X += this.VelocityX;
            this.Y += this.VelocityY;

            if (tickCountSince.Creation >= this.Lifetime) {
                objectManager.removeObject(this);
            }
        };
    }
    Projectile.prototype = Object.create(GameObject.prototype);
    Projectile.prototype.constructor = Projectile;

    function PhotonSmall(ship) {
        Projectile.call(this, ship);
        this.Width = 7;
        this.Height = 7;
        this.CollisionRadius = 4;
        this.VelocityX += -Math.cos(ship.Angle) * 10;
        this.VelocityY += -Math.sin(ship.Angle) * 10;
        this.Sprite = game.mediaManager.Sprites.PhotonSmall;
        this.Lifetime = 50;
    }
    PhotonSmall.prototype = Object.create(Projectile.prototype);
    PhotonSmall.prototype.constructor = PhotonSmall;

    function PufferProjectile(ship) {
        Projectile.call(this, ship);
        this.Width = 17;
        this.Height = 15;
        this.CollisionRadius = 10;
        this.VelocityX += Math.cos(ship.Angle) * 10;
        this.VelocityY += Math.sin(ship.Angle) * 10;
        this.Sprite = game.mediaManager.Sprites.PufferShot;
        this.Lifetime = 50;

        this.handleCollision = function (otherObject) {
            if (otherObject instanceof Puffer
             || otherObject instanceof PufferProjectile) {
               return;
            }

            if (otherObject instanceof PlayerShip) {
                log("PufferShot hit player!");
                game.mediaManager.Audio.CollisionGeneral.play();
                objectManager.removeObject(this);
            }
        };
    }
    PufferProjectile.prototype = Object.create(Projectile.prototype);
    PufferProjectile.prototype.constructor = PufferProjectile;

    function QuadBlasterProjectile(ship, angle) {
        Projectile.call(this, ship);
        this.Width = 7;
        this.Height = 7;
        this.CollisionRadius = 4;
        this.VelocityX += Math.cos(angle) * 10;
        this.VelocityY += Math.sin(angle) * 10;
        this.Sprite = game.mediaManager.Sprites.PhotonSmall;
        this.Lifetime = 50;

        this.handleCollision = function (otherObject) {
            //Projectile.prototype.handleCollision.call(this, otherObject);
            if (otherObject instanceof PlayerShip) {
                log("QuadBlaster hit PlayerShip!");
                game.mediaManager.Audio.CollisionQuad.play();
                objectManager.removeObject(this);
            }
        };

    }
    QuadBlasterProjectile.prototype = Object.create(Projectile.prototype);
    QuadBlasterProjectile.prototype.constructor = QuadBlasterProjectile;

    function PlayerShip(context) {
        var animationFrames, spriteX, spriteY, rotationAmount, accel, numFramesSince, lives, health, maxSpeed;
        GameObject.call(this);
        this.lives = 3;
        this.health = 100;
        this.maxHealth = 100;
        this.Width = 42;
        this.Height = 37;
        this.Mass = 10;
        this.CollisionRadius = 12; // Good balance between wings sticking out and body taking up the whole circle
        this.X = context.canvas.width / 2 - (this.Width / 2);
        this.Y = context.canvas.height / 2 - (this.Height / 2) - 1; // Start 1 pixel down to better line up with starting base.
        this.VelocityX = 0;
        this.VelocityY = 0;
        this.Angle = Math.PI / 2; // Straight up
        animationFrames = 32;
        rotationAmount = (Math.PI * 2) / animationFrames; // 32 frames of animation in the sprite
        // accel = 0.1;
        this.Acceleration = 0.1;
        numFramesSince = {
            Left: 0,
            Right: 0,
            Shooting: 0
        };
        this.Sprite = game.mediaManager.Sprites.PlayerShip;
        spriteX = 0;
        spriteY = 0;
        this.MaxSpeed = 12;

        this.draw = function (context) {
            PlayerShip.prototype.draw.call(this, context);
            // Draw the ship 2 pixels higher to make it better fit inside of the collision circle
            context.drawImage(this.Sprite, spriteX, spriteY, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2 - 2, this.Width, this.Height);
        };

        this.handleCollision = function (otherObject) {
            var oldX, oldY;
            PlayerShip.prototype.handleCollision.call(this, otherObject);

            // Don't die from asteroids yet. It looks cool to bounce off. Take this out when ship damage is implemented.
            if (otherObject instanceof Asteroid) {
                game.mediaManager.Audio.CollisionGeneral.play();
                log("Player hit a Asteroid");
                this.updateHealth(-30);
                return;
            }

            if (otherObject instanceof SludgerMine) {
                log("Player hit a SludgerMine");
                this.updateHealth(-5);
                return;
            }

            if (otherObject instanceof QuadBlasterProjectile) {
                this.updateHealth(-5);
                return;
            }

            if (otherObject instanceof PufferProjectile) {
                this.updateHealth(-20);
                return;
            }
        }

        this.updateHealth = function (healthChange) {
          log("ship Health: " + this.health + healthChange);
          this.health = this.health + healthChange;

          if(this.health <= 0) {
             this.die();
          }

          document.getElementById('health').setAttribute('value', this.health);
        }

        this.die = function () {
            game.mediaManager.Audio.PlayerDeath.play();

            this.VelocityX = 0;
            this.VelocityY = 0;
            this.Angle = Math.PI / 2;
            spriteX = 0;
            spriteY = 0;

            this.lives--;

            if (this.lives <= 0) {
                objectManager.endGame();
            } else {
                if (this.lives === 1) {
                    objectManager.displayMessage("1 life left", 60 * 5)
                } else {
                    objectManager.displayMessage(this.lives + " lives left", 60 * 5)
                }
                objectManager.movePlayerShipTo(Math.random() * (objectManager.GameBounds.Right - objectManager.GameBounds.Left + 1) + objectManager.GameBounds.Left, Math.random() * (objectManager.GameBounds.Bottom - objectManager.GameBounds.Top + 1) + objectManager.GameBounds.Top);

                // reset health to full
                this.updateHealth(this.maxHealth);
            }
        }

        this.updateState = function () {
            if (objectManager.enemiesRemaining() == 0) {
                objectManager.displayMessage("You conquered the fringe with a score of " + score, 99999999);
                this.VelocityX = 0;
                this.VelocityY = 0;
                objectManager.removeObject(this);
            }
        }

        this.processInput = function (KeyState) {
            var i, photon, newVelX, newVelY;

            for (i in numFramesSince) {
                if (numFramesSince.hasOwnProperty(i)) {
                    numFramesSince[i] += 1;
                }
            }

            if (KeyState.isDown(KeyState.UP)) {
                this.calculateAcceleration();
                spriteY = this.Height;
            } else {
                spriteY = 0;
            }

            if (KeyState.isDown(KeyState.LEFT) && numFramesSince.Left >= 3) {
                numFramesSince.Left = 0;
                spriteX -= this.Width;
                this.Angle -= rotationAmount;
                if (spriteX < 0) {
                    spriteX = this.Width * 32 - this.Width;
                }
            }

            if (KeyState.isDown(KeyState.RIGHT) && numFramesSince.Right >= 3) {
                numFramesSince.Right = 0;
                spriteX += this.Width;
                this.Angle += rotationAmount;
                if (spriteX >= this.Width * animationFrames) {
                    spriteX = 0;
                }
            }

            if (KeyState.isDown(KeyState.SPACE)) {
                if (numFramesSince.Shooting >= 13) { // 13 matches up best with the original game's rate of fire at 60fps
                    photon = new PhotonSmall(this);
                    numFramesSince.Shooting = 0;
                    game.mediaManager.Audio.PhotonSmall.play();
                }
            }
        };
    }
    PlayerShip.prototype = Object.create(GameObject.prototype);
    PlayerShip.prototype.constructor = PlayerShip;

    function SludgerMine(bounds, playerShip) {
        var numTicks = 0, spriteX, turnAbility, player, maxSpeed;
        AIGameObject.call(this, playerShip);
        this.Width = 24;
        this.Height = 21;
        this.CollisionRadius = 11;
        this.Mass = 4;
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        this.VelocityX = 0;
        this.VelocityY = 0;
        this.Angle = 0;
        this.Sprite = game.mediaManager.Sprites.SludgerMine;
        spriteX = (Math.floor(Math.random() * 7)) * this.Width;
        log("Started at " + spriteX);
        player = playerShip;
        turnAbility = 0.09;
        this.MaxSpeed = 4;
        this.Acceleration = 0.1;

        this.draw = function (context) {
            SludgerMine.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, spriteX, 0, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2, this.Width, this.Height);
        };

        this.handleCollision = function (otherObject) {

            if (otherObject instanceof Sludger || otherObject instanceof SludgerMine) {
                return;
            }

            SludgerMine.prototype.handleCollision.call(this, otherObject);

            if (otherObject instanceof Projectile) {
                log("SludgerMine blown up by projectile");
                numEnemiesKilled++;
                score += 2
            }

            if (otherObject instanceof PlayerShip) {
                log("SludgerMined the player");
            }

            game.mediaManager.Audio.SludgerMinePop.play();

            objectManager.removeObject(this);
        };

        this.updateState = function () {
            var angleToPlayer, angleDiff;
            numTicks += 1;

            if (numTicks >= 18) {
                numTicks = 0;
                spriteX += this.Width;
                if (spriteX >= this.Width * 8) {
                    spriteX = 0;
                }
            }

            angleToPlayer = this.angleTo(player);

            angleDiff = angleToPlayer - this.Angle;

            this.Angle += angleDiff;

            if (angleToPlayer <= this.Angle + 0.1 || angleToPlayer > this.Angle - 0.1) {
                this.calculateAcceleration();
            }

            this.X += this.VelocityX;
            this.Y += this.VelocityY;
        };
    }
    SludgerMine.prototype = Object.create(AIGameObject.prototype);
    SludgerMine.prototype.constructor = SludgerMine;

    function Sludger(bounds, playerShip) {
        var numTicks = 0, spriteX, player, ticksToSpawnMine = 0;
        AIGameObject.call(this, playerShip);
        this.Width = 34;
        this.Height = 31;
        this.CollisionRadius = 16;
        this.Mass = 8;
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        this.VelocityX = (Math.random() - Math.random()) * 3;
        this.VelocityY = (Math.random() - Math.random()) * 3;
        this.Angle = 0;
        this.Sprite = game.mediaManager.Sprites.Sludger;
        spriteX = 0;
        player = playerShip;

        this.draw = function (context) {
            Sludger.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, spriteX, 0, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2, this.Width, this.Height);
        };

        this.handleCollision = function (otherObject) {

            if (otherObject instanceof SludgerMine) {
                return;
            }

            Sludger.prototype.handleCollision.call(this, otherObject);
            if (otherObject instanceof Projectile) {
                log("Sludger blown up by projectile");
                numEnemiesKilled++;
                score += 50;
            }

            game.mediaManager.Audio.SludgerDeath.play();

            objectManager.removeObject(this);
        };

        this.updateState = function () {
            var angleToPlayer, angleDiff;

            this.X += this.VelocityX;
            this.Y += this.VelocityY;

            if (numTicks >= 7) {
                numTicks = 0;
                spriteX += this.Width;
                if (spriteX >= this.Width * 15) {
                    spriteX = 0;
                }
            } else {
                numTicks += 1;
            }

            if (ticksToSpawnMine > 5 * 60) {
                var newMine = new SludgerMine(bounds, playerShip);
                objectManager.addObject(newMine, true);
                newMine.X = this.X;
                newMine.Y = this.Y;
                ticksToSpawnMine = 0;
            } else {
                ticksToSpawnMine++;
            }
        };
    }
    Sludger.prototype = Object.create(AIGameObject.prototype);
    Sludger.prototype.constructor = Sludger;

    function Puffer(bounds, playerShip) {
        var animationFrames, player, rotationAmount, maxFireRate, minFireRate, numFramesSince, spriteX, turnAbility, ticksToSpawnPhotons = 0;

        AIGameObject.call(this, playerShip);
        this.Width = 42;
        this.Height = 49;
        this.Mass = 10;
        this.CollisionRadius = 14; // Good balance between wings sticking out and body taking up the whole circle
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        this.VelocityX = (Math.random() - Math.random()) * 1;
        this.VelocityY = (Math.random() - Math.random()) * 1;
        this.Angle = 0; // Straight up
        spriteX = 0;
        animationFrames = 32;
        rotationAmount = (Math.PI * 2) / animationFrames; // 32 frames of animation in the sprite
        numFramesSince = {
            Shooting: 0
        };
        player = playerShip;
        turnAbility = 0.015;
        maxFireRate = 3 * 60; // in seconds
        minFireRate = 0.3 * 60; // in seconds
        this.MaxSpeed = 1;
        this.Acceleration = 0.1;

        this.Sprite = game.mediaManager.Sprites.Puffer;

        this.draw = function (context) {
            Puffer.prototype.draw.call(this, context);
            // Draw the ship 2 pixels higher to make it better fit inside of the collision circle
            context.drawImage(this.Sprite, spriteX, 0, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2 - 2, this.Width, this.Height);
        };

        this.handleCollision = function (otherObject) {
            Puffer.prototype.handleCollision.call(this, otherObject);

            if (otherObject instanceof PufferProjectile) {
              return;
            }


            // Don't die from asteroids yet. It looks cool to bounce off. Take this out when ship damage is implemented.
            if (otherObject instanceof PlayerShip) {
              game.mediaManager.Audio.CollisionGeneral.play();
              //return;
            }

            game.mediaManager.Audio.SludgerMinePop.play();

            objectManager.removeObject(this);
        };

        this.updateState = function () {
          var angleToPlayer, angleDiff, frame, frameAngle, i, photon;

          angleDiff = this.angleDiffTo(player);

          // only move the ship angle toward player as fast as the turn ability will allow.
          if ( angleDiff > 0 ) this.Angle += turnAbility;
          else this.Angle -= turnAbility;

          frameAngle = this.Angle-Math.PI/2;

          frame = Math.floor((frameAngle+Math.PI)/rotationAmount);
          if (frame < 0) frame += animationFrames;

          spriteX = this.Width * frame;

          if (angleDiff <= this.Angle + 0.1 || angleDiff > this.Angle - 0.1) {
              this.calculateAcceleration();
          }

          this.X += this.VelocityX;
          this.Y += this.VelocityY;

          for (i in numFramesSince) {
            if (numFramesSince.hasOwnProperty(i)) {
              numFramesSince[i] += 1;
            }
          }


          if (ticksToSpawnPhotons <= 0) {
            if (angleDiff < 0.85 && angleDiff > -0.85) {
              photon = new PufferProjectile(this);
              objectManager.addObject(photon, true);
              ticksToSpawnPhotons = (Math.random() * maxFireRate) + minFireRate;
            }
          }

          ticksToSpawnPhotons--;
        };
    }
    Puffer.prototype = Object.create(AIGameObject.prototype);
    Puffer.prototype.constructor = Puffer;

    function QuadBlaster(bounds, playerShip) {
        var animationFrames, maxFireRate, minFireRate, numTicks = 0, spriteX, player, rotationAmount, ticksToSpawnPhotons = 0;
        AIGameObject.call(this, playerShip);
        this.Width = 40;
        this.Height = 50;
        this.CollisionRadius = 16;
        this.Mass = 8;
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        this.VelocityX = (Math.random() - Math.random()) * 1;
        this.VelocityY = (Math.random() - Math.random()) * 1;
        this.Angle = 0;
        animationFrames = 8 ; // number of frames in the sprite, the sprite only has 1/4th of the whole rotation
        rotationAmount = (Math.PI * 2) / (animationFrames * 4); // multiply by 4 to account for sprite being only a 1/4th
        this.Sprite = game.mediaManager.Sprites.QuadBlaster;
        maxFireRate = 3 * 60; // in seconds
        minFireRate = 0.3 * 60; // in seconds
        spriteX = 10; // sprite starts 10 px in for some 
        player = playerShip;
        this.inScene = false;

        this.getAngleOfBarrelToward = function (object) {
          var angle = this.angleTo(player);

          var quadrant = [
            0,
            1.55,
            -1.55,
            3.15
          ];
          var quadrantAdjusted = [];

          var i = 0;
          for (i = 0;i < 4; i++) {
            quadrantAdjusted[i] = quadrant[i] + this.Angle;
            if (quadrantAdjusted[i] > Math.PI) {
              quadrantAdjusted[i] -= Math.PI *2;
            }
          }

          var closest;
          for (i = 0;i < 4; i++) {
            if (closest == null || Math.abs(quadrantAdjusted[i] - angle) < Math.abs(closest - angle)) {
              closest = quadrantAdjusted[i];
            }
          }

          var quadrantNum = quadrantAdjusted.indexOf(closest);

          return quadrantAdjusted[quadrantNum];
        }

        this.draw = function (context) {
            Sludger.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, spriteX, 0, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2, this.Width, this.Height);
            this.inScene = true;

            if (DEBUG) {
                var barrelAngle = this.getAngleOfBarrelToward(player);
                context.beginPath();
                context.strokeStyle = "green";
                context.moveTo(this.X, this.Y);
                context.lineTo(this.X + Math.cos(barrelAngle) * this.CollisionRadius * 2, this.Y + Math.sin(barrelAngle) * this.CollisionRadius * 2);
                context.stroke();

                context.beginPath();
                context.strokeStyle = "red";
                context.arc(this.X, this.Y, this.CollisionRadius + 2, barrelAngle-0.775, barrelAngle+0.775);
                context.lineWidth = 2;
                context.stroke();
            }
        };

        this.handleCollision = function (otherObject) {

            if (otherObject instanceof QuadBlasterProjectile) {
                return;
            }

            QuadBlaster.prototype.handleCollision.call(this, otherObject);
            if (otherObject instanceof Projectile) {
                log("Sludger blown up by projectile");
                numEnemiesKilled++;
                score += 50;
            }

            game.mediaManager.Audio.SludgerDeath.play();

            objectManager.removeObject(this);
        };

        this.updateState = function () {
            var barrelToPlayer, angleToPlayer, angleRatio;

            this.X += this.VelocityX;
            this.Y += this.VelocityY;

            if (!this.inScene) return;
            this.inScene = false;

            if (numTicks >= 10) { // rotate every 10 ticks / 1/6th second / 166ms
              numTicks = 0;
              spriteX += this.Width;
              this.Angle += rotationAmount;
              if (this.Angle > Math.PI) {
                this.Angle -= Math.PI *2;
              }

              if (spriteX >= this.Width * animationFrames) {
                  spriteX = 10;
              }
            }
            numTicks++;

            if (ticksToSpawnPhotons <= 0) {
              barrelToPlayer = this.getAngleOfBarrelToward(player);
              angleToPlayer = this.angleTo(player);
              angleRatio = angleToPlayer/barrelToPlayer;

              if (angleRatio < 1.15 && angleRatio > 0.85) {

                var projectile = new QuadBlasterProjectile(this, barrelToPlayer);
                objectManager.addObject(projectile, true);
                projectile.X = this.X;
                projectile.Y = this.Y;
                ticksToSpawnPhotons = (Math.random() * maxFireRate) + minFireRate;
              }
            }

            ticksToSpawnPhotons--;
        };

    }
    QuadBlaster.prototype = Object.create(AIGameObject.prototype);
    QuadBlaster.prototype.constructor = QuadBlaster;

    function Star(bounds) {
        var color, currentColor, hasColor, numTicksForColor = 0, twinkleMax, twinkleMin;
        GameObject.call(this);
        twinkleMax = 1 * 60; // in seconds
        twinkleMin = 0.2 * 60; // in seconds
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        color = currentColor = ("rgb(" + Math.floor(Math.random() * 255) + "," + Math.floor(Math.random() * 255) + "," + Math.floor(Math.random() * 255) + ")");

        this.draw = function (context) {
            context.fillStyle = currentColor;
            context.fillRect(this.X, this.Y, 1, 1);
        };

        this.updateState = function () {
          if (numTicksForColor <= 0) {
            if (hasColor) {
              currentColor = "rgb(0,0,0)";
            } else {
              currentColor = color;
            }
            hasColor = !hasColor; // toggle

            numTicksForColor = (Math.random() * twinkleMax) + twinkleMin;
          }

          numTicksForColor--;
        };
    }
    Star.prototype = Object.create(GameObject.prototype);
    Star.prototype.constructor = Star;

    function Base(context) {
        var numTicksForAnim = 0, spriteX;
        GameObject.call(this);
        this.Width = 42;
        this.Height = 32;
        this.CollisionRadius = 30;
        this.X = context.canvas.width / 2 - (this.Width / 2);
        this.Y = context.canvas.height / 2 - (this.Height / 2);
        this.Sprite = game.mediaManager.Sprites.Base;
        spriteX = 0;

        this.draw = function (context) {
            Base.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, spriteX, 0, this.Width, this.Height, this.X - this.Width / 2, this.Y - this.Height / 2, this.Width, this.Height);
        };

        this.updateState = function () {
            numTicksForAnim += 1;
            if (numTicksForAnim >= 6) {
                numTicksForAnim = 0;
                spriteX += this.Width;
                if (spriteX >= this.Width * 4) {
                    spriteX = 0;
                }
            }
        };
    }
    Base.prototype = Object.create(GameObject.prototype);
    Base.prototype.constructor = Base;

    function EnemyBase(bounds, playerShip) {
        var numTicksForSpawn = 0;
        AIGameObject.call(this, playerShip);
        this.Width = 62;
        this.Height = 60;
        this.CollisionRadius = 28;
        this.X = -1000; //context.canvas.width / 2 - (this.Width / 2);
        this.Y = -1000; //context.canvas.height / 2 - (this.Height / 2);
        /*this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;*/
        this.Sprite = game.mediaManager.Sprites.EnemyBase;

        this.draw = function (context) {
            EnemyBase.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, this.X - this.Width / 2, this.Y - this.Height / 2);
        };

        this.updateState = function () {
            numTicksForSpawn += 1;
            if (numTicksForSpawn >= 10 * 60) {
                numTicksForSpawn = 0;
                //log("Enemy base spawning enemy");
            }
        };
    }
    EnemyBase.prototype = Object.create(AIGameObject.prototype);
    EnemyBase.prototype.constructor = EnemyBase;

    function Asteroid(bounds) {
        GameObject.call(this);
        this.X = Math.random() * (bounds.Right - bounds.Left + 1) + bounds.Left;
        this.Y = Math.random() * (bounds.Bottom - bounds.Top + 1) + bounds.Top;
        this.VelocityX = (Math.random() - Math.random()) * 2;
        this.VelocityY = (Math.random() - Math.random()) * 2;

        this.draw = function (context) {
            Asteroid.prototype.draw.call(this, context);
            context.drawImage(this.Sprite, this.X - this.Width / 2, this.Y - this.Height / 2);
        };

        this.updateState = function () {
            this.X += this.VelocityX;
            this.Y += this.VelocityY;
        };
    }
    Asteroid.prototype = Object.create(GameObject.prototype);
    Asteroid.prototype.constructor = Asteroid;

    function Pebbles(bounds) {
        Asteroid.call(this, bounds);
        this.Width = 25;
        this.Height = 26;
        this.Mass = 100;
        this.CollisionRadius = 13;
        this.VelocityX *= 3;
        this.VelocityY *= 3;
        this.Sprite = game.mediaManager.Sprites.Pebbles;
    }
    Pebbles.prototype = Object.create(Asteroid.prototype);
    Pebbles.prototype.constructor = Pebbles;

    function Rocko(bounds) {
        Asteroid.call(this, bounds);
        this.Width = 35;
        this.Height = 36;
        this.Mass = 500;
        this.CollisionRadius = 18;
        this.Sprite = game.mediaManager.Sprites.Rocko;
    }
    Rocko.prototype = Object.create(Asteroid.prototype);
    Rocko.prototype.constructor = Rocko;

    function ObjectManager(canvasContext) {
        var objects, collidables, newObject, i, context, playerShip, moveObject, updateObjects, detectCollisions, drawObjects,
                    GameBounds, checkBounds, handleCollision, setupPositions, numMessageTicks, numMessageTicksMax, message,
                    isRunning, isPaused;

        context = canvasContext;

        this.GameBounds = GameBounds = {
            Left: -2000,
            Top: -2000,
            Right: 2000,
            Bottom: 2000
        };

        this.addObject = function (object, collidable) {
            collidable = typeof collidable !== 'undefined' ? collidable : true;
            objects.push(object);
            if (collidable) {
                collidables.push(object);
            }
        };

        this.removeObject = function (object) {
            var i;

            for (i = objects.length; i >= 0; i -= 1) {
                if (objects[i] === object) {
                    objects.splice(i, 1);
                    break;
                }
            }

            for (i = collidables.length; i >= 0; i -= 1) {
                if (collidables[i] === object) {
                    collidables.splice(i, 1);
                    break;
                }
            }
        };

        checkBounds = function (object) {
            if (object.X > GameBounds.Right) { object.X = GameBounds.Left + (object.X - GameBounds.Right); }
            if (object.X < GameBounds.Left) { object.X = GameBounds.Right - (GameBounds.Left - object.X); }
            if (object.Y > GameBounds.Bottom) { object.Y = GameBounds.Top + (object.Y - GameBounds.Bottom); }
            if (object.Y < GameBounds.Top) { object.Y = GameBounds.Bottom - (GameBounds.Top - object.Y); }
        };

        this.displayMessage = function (text, ticksToShow) {
            numMessageTicks = 0;
            numMessageTicksMax = ticksToShow;
            message = text;
            log("DisplayMessage called with " + text + " - " + ticksToShow);
        };

        this.handleResize = function (event) {
            var oldCenterX, oldCenterY, diffX, diffY;

            oldCenterX = context.canvas.width / 2;
            oldCenterY = context.canvas.height / 2;

            context.canvas.width = window.innerWidth;
            context.canvas.height = window.innerHeight;

            diffX = context.canvas.width / 2 - oldCenterX;
            diffY = context.canvas.height / 2 - oldCenterY;

            for (i = 0; i < objects.length; i += 1) {
                objects[i].X += diffX;
                objects[i].Y += diffY;
                checkBounds(objects[i]);
            }
        };

        moveObject = function (object) {
            if (object instanceof PlayerShip) { return; }

            object.X -= playerShip.VelocityX;
            object.Y -= playerShip.VelocityY;
            checkBounds(object);
        };

        updateObjects = function (objects) {
            var i;

            for (i = 0; i < objects.length; i += 1) {
                objects[i].processInput(Key);
                moveObject(objects[i]);
                objects[i].updateState();
            }
        };

        detectCollisions = function (collidables) {
            var i, j, collidablesSnapshot;

            collidablesSnapshot = collidables.slice(0);

            for (i = 0; i < collidablesSnapshot.length; i += 1) {
                for (j = i + 1; j < collidablesSnapshot.length; j += 1) {
                    if (Math.pow((collidablesSnapshot[j].X - collidablesSnapshot[i].X), 2) + Math.pow((collidablesSnapshot[j].Y - collidablesSnapshot[i].Y), 2)
                            <=
                            (collidablesSnapshot[i].CollisionRadius + collidablesSnapshot[j].CollisionRadius) * (collidablesSnapshot[i].CollisionRadius + collidablesSnapshot[j].CollisionRadius)) {
                        collidablesSnapshot[i].handleCollision(collidablesSnapshot[j]);
                        collidablesSnapshot[j].handleCollision(collidablesSnapshot[i]);
                    }
                }
            }
        };

        this.enemiesRemaining = function () {
            var i, numEnemies = 0;

            for (i = 0; i < objects.length; i += 1) {
                if (objects[i] instanceof AIGameObject && !(objects[i]   instanceof EnemyBase)) {
                    numEnemies++;
                }
            }

            return numEnemies;
        };

        this.staticEffect = function (percentWorking) {
            var pixels = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
            var pixelData = pixels.data;
            for (var i = 0, n = pixelData.length; i < n; i += 4) {
                //var grayscale = pixelData[i  ] * .3 + pixelData[i+1] * .59 + pixelData[i+2] * .11;
                //pixelData[i  ] = grayscale;   // red
                //pixelData[i+1] = grayscale;   // green
                //pixelData[i+2] = grayscale;   // blue
                pixelData[i + 3] = Math.random() * (255 * (percentWorking / 100))// alpha
            }
            context.putImageData(pixels, 0, 0);
        };

        drawObjects = function (objects, context) {
            var i;
            context.clearRect(0, 0, context.canvas.width, context.canvas.height);
            //canvas.width = canvas.width; // This is only faster in some browsers and clearRect seems like the most logical way to clear the canvas. http://jsperf.com/canvasclear

            for (i = 0; i < objects.length; i += 1) {
                // Only draw the objects if they are within the viewing window
                if (objects[i].X + objects[i].Width > 0 &&
                        objects[i].X - objects[i].Width < context.canvas.width &&
                        objects[i].Y + objects[i].Height > 0 &&
                        objects[i].Y - objects[i].Height < context.canvas.height) {
                    context.save();
                    objects[i].draw(context);
                    context.restore();
                }
            }

            numMessageTicks++;
            if (numMessageTicks < numMessageTicksMax) {
                context.fillStyle = '#808080';
                context.font = 'bold 30px sans-serif';
                context.textBaseline = 'bottom';
                context.fillText(message, context.canvas.width / 2 - (((message.length / 2) * 30) / 2), context.canvas.height / 2 - 40);
            }
        };

        this.movePlayerShipTo = function (x, y) {
            var diffX, diffY;

            //diffX = playerShip.X - x;
            //diffY = playerShip.Y - y;

            for (i = 0; i < objects.length; i += 1) {
                if (objects[i] instanceof PlayerShip) continue;
                //objects[i].X += diffX;
                //objects[i].Y += diffY;
                objects[i].X -= x;
                objects[i].Y -= y;
                checkBounds(objects[i]);
            }
        }

        this.initializeGame = function () {
            objects = [];
            collidables = [];

            game.PlayerShip = playerShip = new PlayerShip(context);

            for (i = 0; i < 600; i += 1) {
                this.addObject(new Star(GameBounds), false);
            }

            this.addObject(new Base(context));

            this.addObject(new EnemyBase(GameBounds, game.PlayerShip));

            for (i = 0; i < 6; i += 1) {
                this.addObject(new Pebbles(GameBounds));
            }

            for (i = 0; i < 3; i += 1) {
                this.addObject(new Rocko(GameBounds));
            }

            for (i = 0; i < 4; i += 1) {
                this.addObject(new Sludger(GameBounds, game.PlayerShip));
            }

            for (i = 0; i < 5; i += 1) {
                this.addObject(new QuadBlaster(GameBounds, game.PlayerShip));
            }

            for (i = 0; i < 4; i += 1) {
                this.addObject(new Puffer(GameBounds, game.PlayerShip));
            }

            //this.addObject(new SludgerMine(GameBounds, game.PlayerShip));

            // Add ship last so it draws on top of most objects
            this.addObject(game.PlayerShip, true);
            game.mediaManager.Audio.StartUp.play();
        };

        this.endGame = function () {
            isPaused = true;
            isRunning = false;
            objectManager.displayMessage("You achieved a score of " + score + " before the fringe took you", 99999999999);
            objectManager.removeObject(playerShip)
        };

        this.pauseGame = function () {
          isPaused = true;
          console.log('paused')
        }

        this.resumeGame = function () {
          isPaused = false;
          objectManager.gameLoop(true);
          animationLoop();
          console.log('resume')
        }

        this.gameLoop = (function () {
            var i = 0, loops = 0, skipTicks = 1000 / 60, maxFrameSkip = 10, nextGameTick = (new Date()).getTime();

            return function (resetGameTick) {
                loops = 0;

                if (resetGameTick === true) {
                    nextGameTick = (new Date()).getTime();
                }

                while ((new Date()).getTime() > nextGameTick && loops < maxFrameSkip) {
                    updateObjects(objects);
                    detectCollisions(collidables);
                    nextGameTick += skipTicks;
                    loops += 1;
                }

                if (loops) {
                    drawObjects(objects, context);
                }
            };
        } ());

        this.initializeGame();
    }

    objectManager = new ObjectManager(canvas.getContext("2d"));

    animationLoop = function() {
      // stop loop if paused
      if (objectManager.isPaused == true) return;

      // Start the game loop
      objectManager.gameLoop();
      requestAnimationFrame(animationLoop);
    };

    animationLoop();

    function handleVisibilityChange() {
        if (document[hidden]) {
          objectManager.pauseGame();
        } else {
          objectManager.resumeGame();
        }
    }

    document.addEventListener(visibilityChange, handleVisibilityChange, false);

    window.addEventListener('resize', function (event) { objectManager.handleResize(event); }, false);
    window.addEventListener('keyup', function (event) { Key.onKeyup(event); }, false);
    window.addEventListener('keydown', function (event) { Key.onKeydown(event); }, false);

};

var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support 
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
  hidden = "mozHidden";
  visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}
